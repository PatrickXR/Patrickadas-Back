require('reflect-metadata');
jest.setTimeout(30000);
const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const { configureApplication } = require('../dist/configure-app');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { randomUUID } = require('node:crypto');

describe('Catálogo com API e Supabase locais', () => {
  let app;
  let token;

  beforeAll(async () => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.SUPABASE_URL).hostname)) {
      throw new Error('O teste exige Supabase local');
    }
    const { AppModule } = require('../dist/app.module');
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    configureApplication(app);
    await app.init();
    const result = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'colaborador@teste.local', password: 'colaborador123', expectedRole: 'colaborador',
    });
    expect(result.status).toBe(200);
    token = result.body.token;
  });

  afterAll(async () => { if (app) await app.close(); });

  test('test_ca_01_ca_02_ca_03_ca_11_catalogo_pagina_dados_reais_sem_expor_emprestimos', async () => {
    const first = await request(app.getHttpServer()).get('/v1/equipment?limit=1').auth(token, { type: 'bearer' });
    expect(first.status).toBe(200);
    expect(first.body.total).toBeGreaterThan(1);
    expect(first.body.items).toHaveLength(1);
    expect(Object.keys(first.body.items[0]).sort()).toEqual(['categoria', 'id', 'imageUrl', 'isMine', 'nome', 'observacoes', 'patrimonio', 'status']);
    const second = await request(app.getHttpServer()).get(`/v1/equipment?limit=1&cursor=${first.body.nextCursor}`).auth(token, { type: 'bearer' });
    expect(second.status).toBe(200);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });

  test('test_ca_11_ca_13_catalogo_exige_sessao_e_valida_consulta', async () => {
    const anonymous = await request(app.getHttpServer()).get('/v1/equipment');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.status).toBe(401);
    const invalid = await request(app.getHttpServer()).get('/v1/equipment?tenant_id=other').auth(token, { type: 'bearer' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.status).toBe(400);
  });

  test('test_ca_11_catalogo_oculta_equipamento_e_cursor_de_outro_tenant', async () => {
    const db = app.get(PrismaService);
    const id = randomUUID();
    const name = `catalog-test-${id}`;
    await db.tenant.create({ data: { id, slug: name, name } });
    try {
      const equipment = await db.equipment.create({ data: {
        tenantId: id, nome: name, patrimonio: name, categoria: 'monitor', situacao: 'disponivel',
        imagePath: `${id}/test.png`, pixabayId: 1n, imageAuthor: 'Fixture',
        imageLicense: 'Fixture', imageSource: 'https://pixabay.com/photos/test-1/',
      } });
      const search = await request(app.getHttpServer()).get('/v1/equipment').query({ q: name }).auth(token, { type: 'bearer' });
      expect(search.status).toBe(200);
      expect(search.body.items).toEqual([]);
      const cursor = await request(app.getHttpServer()).get('/v1/equipment').query({ cursor: equipment.id }).auth(token, { type: 'bearer' });
      expect(cursor.status).toBe(400);
      expect(cursor.body.status).toBe(400);
    } finally {
      await db.equipment.deleteMany({ where: { tenantId: id } });
      await db.tenant.delete({ where: { id } });
    }
  });
});
