require('reflect-metadata');

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const { createClient } = require('@supabase/supabase-js');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { AuthModule } = require('../dist/modules/auth/auth.module');
const { AuthRepository } = require('../dist/modules/auth/auth.repository');

const credentials = {
  colaborador: { email: 'colaborador@teste.local', password: 'colaborador123' },
  operacoes: { email: 'operacoes@teste.local', password: 'operacoes123' },
};

describe('Login: isolamento de clientes Supabase (sem banco)', () => {
  let app;
  let clients;
  let membershipQueries;

  beforeEach(async () => {
    clients = [];
    membershipQueries = [];
    createClient.mockImplementation((_url, _key, options) => {
      const client = {
        options,
        sessionUser: null,
        auth: {
          signInWithPassword: jest.fn(async ({ email, password }) => {
            const role = Object.keys(credentials).find((candidate) =>
              credentials[candidate].email === email && credentials[candidate].password === password,
            );
            if (!role) return { data: { session: null, user: null }, error: { message: 'Invalid credentials' } };
            client.sessionUser = role;
            // Yield so concurrent requests expose accidental shared client state.
            await new Promise((resolve) => setImmediate(resolve));
            return { data: { session: { access_token: `token-${role}` }, user: { id: role } }, error: null };
          }),
        },
        from: jest.fn((table) => {
          const query = {
            select: jest.fn(() => query),
            eq: jest.fn((_column, userId) => { query.userId = userId; return query; }),
            limit: jest.fn(() => query),
            maybeSingle: jest.fn(async () => {
              membershipQueries.push({ table, userId: query.userId, sessionUser: client.sessionUser });
              // Simulate RLS when a privileged client is accidentally signed in.
              const visible = !client.sessionUser || client.sessionUser === query.userId;
              return { data: visible ? { role: query.userId } : null, error: null };
            }),
          };
          return query;
        }),
      };
      clients.push(client);
      return client;
    });

    // Explicit fake configuration: these tests cannot load or contact .env.
    class TestAuthModule {}
    const { Module } = require('@nestjs/common');
    const { ConfigModule } = require('@nestjs/config');
    Module({ imports: [ConfigModule.forRoot({
      ignoreEnvFile: true,
      ignoreEnvVars: true,
      isGlobal: true,
      load: [() => ({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'test-only-key' })],
    }), AuthModule] })(TestAuthModule);
    app = await NestFactory.create(TestAuthModule, { logger: false });
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => { if (app) await app.close(); });

  function login(role, expectedRole = role, overrides = {}) {
    return request(app.getHttpServer()).post('/v1/auth/login')
      .send({ ...credentials[role], expectedRole, ...overrides });
  }

  test.each(['colaborador', 'operacoes'])('test_ca_02_ca_03_login_%s_returns_real_role', async (role) => {
    const response = await login(role);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ token: `token-${role}`, role, userId: role });
  });

  test.each([['colaborador', 'operacoes'], ['operacoes', 'colaborador']])(
    'test_ca_04_%s_cannot_enter_as_%s', async (role, expectedRole) => {
      const response = await login(role, expectedRole);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ type: 'about:blank', title: 'Papel incompativel', status: 403,
        detail: 'Este usuario nao tem acesso por este botao.' });
      expect(response.body).not.toHaveProperty('token');
      expect(clients[0].sessionUser).toBeNull();
    },
  );

  test('test_ca_05_unknown_email_and_wrong_password_have_the_same_error', async () => {
    const wrongPassword = await login('colaborador', 'colaborador', { password: 'wrong-password' });
    const unknownEmail = await login('colaborador', 'colaborador', { email: 'unknown@teste.local' });
    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ type: 'about:blank', title: 'Credenciais invalidas', status: 401,
        detail: 'E-mail ou senha incorretos.' });
      expect(response.body).not.toHaveProperty('token');
    }
    expect(membershipQueries).toHaveLength(0);
  });

  test('test_ca_02_ca_03_ca_04_concurrent_logins_do_not_share_sessions_or_admin_identity', async () => {
    const responses = await Promise.all([
      login('colaborador'), login('operacoes'), login('colaborador', 'operacoes'), login('operacoes'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 403, 200]);
    expect(responses.map((response) => response.body.role)).toEqual(['colaborador', 'operacoes', undefined, 'operacoes']);
    expect(responses[2].body).not.toHaveProperty('token');
    expect(clients).toHaveLength(5); // One privileged client, one per sign-in.
    expect(clients[0].auth.signInWithPassword).not.toHaveBeenCalled();
    expect(membershipQueries).toHaveLength(4);
    expect(membershipQueries.every((query) => query.table === 'memberships' && query.sessionUser === null)).toBe(true);
    for (const client of clients) {
      expect(client.options.auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    }
  });

  test('test_ca_04_user_without_membership_receives_no_token', async () => {
    const repository = app.get(AuthRepository);
    jest.spyOn(repository, 'findMembershipRole').mockResolvedValueOnce(null);
    const response = await login('colaborador');
    expect(response.status).toBe(403);
    expect(response.body.status).toBe(403);
    expect(response.body).not.toHaveProperty('token');
  });

  test('test_ca_04_invalid_role_is_rejected_before_authentication', async () => {
    const response = await login('colaborador', 'admin');
    expect(response.status).toBe(400);
    expect(response.body.statusCode).toBe(400);
    expect(response.body).not.toHaveProperty('token');
    expect(clients).toHaveLength(1);
  });
});
