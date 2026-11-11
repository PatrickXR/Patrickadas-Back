require('reflect-metadata');

const { randomUUID } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { PrismaModule } = require('../dist/prisma/prisma.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { RateLimitService } = require('../dist/http/rate-limit.service');

describe('Prisma no Supabase local', () => {
  let app;
  let database;

  beforeAll(async () => {
    const configuredUrl = process.env.DATABASE_URL;
    if (!configuredUrl || !URL.canParse(configuredUrl)) {
      throw new Error('Os testes Prisma exigem DATABASE_URL local');
    }
    const target = new URL(configuredUrl);
    if (!['postgresql:', 'postgres:'].includes(target.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || target.port !== '54333') {
      throw new Error('Destino fora do Supabase local do Patrickadas');
    }
    app = await NestFactory.createApplicationContext(PrismaModule, { logger: false });
    database = app.get(PrismaService);
  });

  afterAll(async () => { if (app) await app.close(); });

  test('test_ca_11_ca_12_contagem_ip_concorrente_sem_perda_e_resposta_429', async () => {
    const suffix = randomUUID().slice(0, 8);
    const address = `2001:db8::${suffix.slice(0, 4)}:${suffix.slice(4)}`;
    const limits = new RateLimitService(database);
    try {
      const hits = await Promise.all(Array.from({ length: 8 }, () => limits.countIp(address)));
      expect(hits.every(hit => hit.retry_after >= 1 && hit.retry_after <= 60)).toBe(true);
      const totals = await database.rateLimitBucket.aggregate({
        where: { scope: 'ip', ipAddress: address }, _sum: { hitCount: true },
      });
      expect(totals._sum.hitCount).toBe(8n);
      const response = { setHeader: jest.fn() };
      expect(() => limits.enforce({ hit_count: 301n, retry_after: 12 }, 300, response))
        .toThrow('Limite de requisições atingido');
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '12');
    } finally {
      await database.rateLimitBucket.deleteMany({ where: { scope: 'ip', ipAddress: address } });
    }
  });

  test('test_ca_11_ca_12_escopo_por_tenant_em_consultas_parametrizadas', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const rollback = new Error('Fim da transação de teste');

    await expect(database.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: [tenantA, tenantB].map(id => ({
        id, slug: `prisma-test-${id}`, name: 'Tenant de teste',
      })) });

      const shared = {
        patrimonio: 'PRISMA-TESTE', nome: 'Monitor de teste', categoria: 'monitor',
        situacao: 'disponivel', pixabayId: 1n,
        imageSource: 'https://pixabay.com/photos/test-1/', imageAuthor: 'Fixture', imageLicense: 'Fixture',
      };
      const itemA = await tx.equipment.create({ data: { ...shared, tenantId: tenantA, imagePath: `${tenantA}/test.png` } });
      const itemB = await tx.equipment.create({ data: { ...shared, tenantId: tenantB, imagePath: `${tenantB}/test.png` } });

      const scoped = await tx.equipment.findMany({
        where: { tenantId: tenantA, patrimonio: shared.patrimonio }, select: { id: true },
      });
      expect(scoped).toEqual([{ id: itemA.id }]);
      await expect(tx.equipment.findUnique({
        where: { tenantId_id: { tenantId: tenantA, id: itemB.id } },
      })).resolves.toBeNull();

      const rows = await tx.$queryRaw`
        select id from public.equipment
        where tenant_id = ${tenantB}::uuid and patrimonio = ${shared.patrimonio}
      `;
      expect(rows).toEqual([{ id: itemB.id }]);
      throw rollback;
    })).rejects.toBe(rollback);

    await expect(database.tenant.count({ where: { id: { in: [tenantA, tenantB] } } })).resolves.toBe(0);
  });

  test('test_ca_009_03_contadores_isolam_usuario_e_tenant', async () => {
    const tenants = [randomUUID(), randomUUID()];
    const users = [randomUUID(), randomUUID()];
    const rollback = new Error('Rollback dos contadores fictícios');
    await expect(database.$transaction(async tx => {
      await tx.tenant.createMany({ data: tenants.map(id => ({ id, slug: `limit-test-${id}`, name: 'Teste' })) });
      await tx.$executeRaw`insert into auth.users(id) values (${users[0]}::uuid), (${users[1]}::uuid)`;
      await tx.membership.createMany({ data: [
        { userId: users[0], tenantId: tenants[0], role: 'colaborador' },
        { userId: users[1], tenantId: tenants[0], role: 'colaborador' },
        { userId: users[0], tenantId: tenants[1], role: 'colaborador' },
      ] });
      const limits = new RateLimitService(tx);
      await limits.countUser(tenants[0], users[0]);
      await limits.countUser(tenants[0], users[0]);
      await limits.countUser(tenants[0], users[1]);
      await limits.countUser(tenants[1], users[0]);
      for (const [tenantId, userId, count] of [
        [tenants[0], users[0], 2n], [tenants[0], users[1], 1n], [tenants[1], users[0], 1n],
      ]) {
        const total = await tx.rateLimitBucket.aggregate({ where: { scope: 'user', tenantId, userId }, _sum: { hitCount: true } });
        expect(total._sum.hitCount).toBe(count);
      }
      const response = { setHeader: jest.fn() };
      expect(() => limits.enforce({ hit_count: 121n, retry_after: 10 }, 120, response)).toThrow();
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '10');
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await database.tenant.count({ where: { id: { in: tenants } } })).toBe(0);
  });
});
