require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');

const accounts = {
  colaborador: { email: 'colaborador@teste.local', password: 'colaborador123' },
  operacoes: { email: 'operacoes@teste.local', password: 'operacoes123' },
};

describe('Login: Supabase LOCAL real', () => {
  let app;
  let supabaseUrl;

  beforeAll(async () => {
    // AppModule loads .env, but no client is instantiated before the URL guard.
    const { AppModule } = require('../dist/app.module');
    const target = new URL(process.env.SUPABASE_URL);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.protocol !== 'http:') {
      throw new Error('Os testes de login exigem SUPABASE_URL HTTP local. Banco remoto proibido.');
    }
    supabaseUrl = target;
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => { if (app) await app.close(); });

  function login(role, expectedRole = role, overrides = {}) {
    return request(app.getHttpServer()).post('/v1/auth/login')
      .send({ ...accounts[role], expectedRole, ...overrides });
  }

  test.each(['colaborador', 'operacoes'])('test_ca_02_ca_03_local_%s_receives_own_role_and_token', async (role) => {
    const response = await login(role);
    expect(response.status).toBe(200);
    expect(response.body.role).toBe(role);
    expect(typeof response.body.token).toBe('string');
    expect(response.body.token.split('.')).toHaveLength(3);
    expect(response.body.userId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test.each([['colaborador', 'operacoes'], ['operacoes', 'colaborador']])(
    'test_ca_04_local_%s_cannot_enter_as_%s', async (role, expectedRole) => {
      const response = await login(role, expectedRole);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ type: 'about:blank', title: 'Papel incompativel', status: 403,
        detail: 'Este usuario nao tem acesso por este botao.' });
      expect(response.body).not.toHaveProperty('token');
    },
  );

  test('test_ca_05_local_invalid_credentials_have_the_same_generic_response', async () => {
    const responses = [
      await login('colaborador', 'colaborador', { password: 'wrong-password' }),
      await login('colaborador', 'colaborador', { email: 'unknown@teste.local' }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ type: 'about:blank', title: 'Credenciais invalidas', status: 401,
        detail: 'E-mail ou senha incorretos.' });
      expect(response.body).not.toHaveProperty('token');
    }
  });

  test('test_ca_02_ca_03_ca_04_local_concurrent_logins_keep_roles_separate', async () => {
    const responses = await Promise.all([
      login('colaborador'), login('operacoes'), login('colaborador', 'operacoes'), login('operacoes'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 403, 200]);
    expect(responses.map((response) => response.body.role)).toEqual(['colaborador', 'operacoes', undefined, 'operacoes']);
    expect(responses[0].body.userId === responses[1].body.userId).toBe(false);
    expect(responses[1].body.userId === responses[3].body.userId).toBe(true);
    expect(responses[2].body).not.toHaveProperty('token');
  });

  test('test_ca_04_local_rls_hides_another_users_membership', async () => {
    const collaborator = await login('colaborador');
    const operations = await login('operacoes');
    expect(collaborator.status).toBe(200);
    expect(operations.status).toBe(200);

    for (const [viewer, other] of [[collaborator, operations], [operations, collaborator]]) {
      for (const own of [true, false]) {
        const endpoint = new URL('/rest/v1/memberships', supabaseUrl);
        endpoint.searchParams.set('select', 'user_id,role');
        endpoint.searchParams.set('user_id', `eq.${own ? viewer.body.userId : other.body.userId}`);
        const response = await fetch(endpoint, {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${viewer.body.token}`,
          },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(own
          ? [{ user_id: viewer.body.userId, role: viewer.body.role }]
          : []);
      }
    }
  });
});
