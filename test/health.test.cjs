require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const { configureApplication } = require('../dist/configure-app');

describe('002-health: liveness público, sem dependências externas', () => {
  let app;
  let externalFetch;

  beforeAll(async () => {
    const { AppModule } = require('../dist/app.module');
    const target = new URL(process.env.SUPABASE_URL);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.protocol !== 'http:') {
      throw new Error('Testes exigem configuração Supabase local; remoto proibido.');
    }
    externalFetch = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('Health não deve consultar serviços externos.');
    });
    app = await NestFactory.create(AppModule, { logger: false });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (externalFetch) externalFetch.mockRestore();
  });

  test.each(['/health', '/v1/health'])(
    'test_ca_01_ca_02_ca_03_GET_%s_returns_exact_json_without_auth_or_database', async (route) => {
      const response = await request(app.getHttpServer()).get(route);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^application\/json\b/);
      expect(response.body).toEqual({ status: 'ok' });
      expect(externalFetch).not.toHaveBeenCalled();
    },
  );

  test('test_ca_02_no_accidental_double_version_prefix', async () => {
    const response = await request(app.getHttpServer()).get('/v1/v1/health');
    expect(response.status).toBe(404);
    expect(response.body.statusCode).toBe(404);
  });

  test.each(['/health', '/v1/health'])(
    'test_ca_01_ca_02_POST_%s_does_not_invoke_the_health_handler', async (route) => {
      const response = await request(app.getHttpServer()).post(route);
      expect(response.status).toBe(404);
      expect(response.body.statusCode).toBe(404);
      expect(externalFetch).not.toHaveBeenCalled();
    },
  );
});
