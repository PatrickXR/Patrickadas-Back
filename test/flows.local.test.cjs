require('reflect-metadata');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { accessContext, createAbility } = require('../dist/modules/auth/access-context');
const { LoansService } = require('../dist/modules/loans/loans.service');
const { EquipmentService } = require('../dist/modules/equipment/equipment.service');

jest.setTimeout(30000);
let db;
beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost','127.0.0.1'].includes(url.hostname) || url.port !== '54333') throw new Error('Banco local obrigatório');
  db = new PrismaClient();
});
afterAll(async () => { if (db) await db.$disconnect(); });

async function scenario(check) {
  const rollback = new Error('Rollback das fixtures');
  await expect(db.$transaction(async tx => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const operatorId = randomUUID();
    await tx.tenant.create({ data: { id: tenantId, slug: `flow-test-${tenantId}`, name: 'Teste' } });
    await tx.$executeRaw`insert into auth.users(id) values (${userId}::uuid),(${operatorId}::uuid)`;
    await tx.membership.createMany({ data: [{ userId, tenantId, role: 'colaborador' }, { userId: operatorId, tenantId, role: 'operacoes' }] });
    const facade = { $transaction: fn => fn(tx), loan: tx.loan };
    const loans = new LoansService(facade, { displayName: async id => id });
    const equipment = new EquipmentService(facade, new ConfigService());
    const as = (role, callback) => {
      const member = { userId: role === 'operacoes' ? operatorId : userId, tenantId, role };
      return accessContext.run({ ...member, ability: createAbility(member) }, callback);
    };
    const create = index => as('operacoes', () => equipment.manage({ nome: `Monitor ${index}`, patrimonio: `TEST-${index}`, categoria: 'monitor', situacao: 'disponivel' }));
    await check({ tx, loans, equipment, as, create, userId, tenantId });
    throw rollback;
  }, { timeout: 25000 })).rejects.toBe(rollback);
}

test('test_ca_06_ca_07_ca_09_ca_12_emprestar_devolver_gerenciar_e_auditar', () => scenario(async ({ tx, loans, equipment, as, create, userId, tenantId }) => {
  const items = await Promise.all([1,2,3,4].map(create));
  await expect(as('colaborador', () => equipment.manage({ nome:'X', patrimonio:'X', categoria:'monitor', situacao:'disponivel' })))
    .rejects.toMatchObject({ status: 403 });
  const first = await as('colaborador', () => loans.create(items[0].id));
  await expect(as('colaborador', () => loans.create(items[0].id))).rejects.toMatchObject({ status:409 });
  await as('colaborador', () => loans.create(items[1].id));
  await as('colaborador', () => loans.create(items[2].id));
  await expect(as('colaborador', () => loans.create(items[3].id))).rejects.toMatchObject({ code:'loan_limit', status:403 });
  expect(await tx.auditEvent.count({ where:{tenantId} })).toBe(3);
  await expect(as('operacoes', () => equipment.manage(null, items[0].id))).rejects.toMatchObject({ status:409 });
  await as('operacoes', () => loans.returnItem(first.id));
  const repeated = await as('colaborador', () => loans.returnItem(first.id));
  expect(repeated.changed).toBe(false);
  expect(await tx.auditEvent.count({ where:{tenantId,action:'loan.returned'} })).toBe(1);
  await expect(as('operacoes', () => equipment.manage(null, items[0].id))).rejects.toMatchObject({ status:409 });
  await as('operacoes', () => equipment.manage({ nome:'Editado', patrimonio:'TEST-1', categoria:'monitor', situacao:'manutencao' }, items[0].id));
  await expect(as('colaborador', () => loans.create(items[0].id))).rejects.toMatchObject({status:409});
  await as('operacoes', () => equipment.manage(null, items[3].id));
  expect(await tx.equipment.findUnique({where:{id:items[3].id}})).toBeNull();
  const own = await as('colaborador', () => loans.list());
  expect(own).toHaveLength(2);
  expect(own.every(row=>!('userId' in row))).toBe(true);
  await expect(as('colaborador', () => loans.list(true))).rejects.toMatchObject({status:403});
  const ops = await as('operacoes', () => loans.list(true));
  expect(ops.every(row=>row.userId===userId)).toBe(true);
}));

test('test_ca_08_atraso_bloqueia_novo_emprestimo', () => scenario(async ({tx,loans,as,create,userId,tenantId}) => {
  const first = await create(1);
  const second = await create(2);
  await tx.loan.create({data:{tenantId,userId,equipmentId:first.id,borrowedAt:new Date('2020-01-01T12:00:00Z'),dueOn:new Date('2020-01-15T00:00:00Z')}});
  await expect(as('colaborador',()=>loans.create(second.id))).rejects.toMatchObject({code:'overdue',status:403});
}));
