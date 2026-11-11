require('reflect-metadata');
const { Body, Controller, ForbiddenException, Module, Post, UnauthorizedException } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { createZodDto } = require('nestjs-zod');
const { z } = require('zod');
const request = require('supertest');
const { ValidatedApi } = require('../dist/http/validated-api');
const { configureApplication } = require('../dist/configure-app');

class Input extends createZodDto(z.object({ value: z.string() }).strict()) {}
class TestController {
  run({ value }) {
    if (value === 'unauthorized') throw new UnauthorizedException('internal test message');
    if (value === 'forbidden') throw new ForbiddenException('internal test message');
    if (value === 'error') throw new Error('internal test message');
    return { value };
  }
}
Reflect.defineMetadata('design:paramtypes', [Input], TestController.prototype, 'run');
Body()(TestController.prototype, 'run', 0);
Post()(TestController.prototype, 'run', Object.getOwnPropertyDescriptor(TestController.prototype, 'run'));
Controller('fixture')(TestController);
ValidatedApi()(TestController);
class TestModule {}
Module({ controllers: [TestController] })(TestModule);

let app;
beforeAll(async () => {
  app = await NestFactory.create(TestModule, { logger: false });
  configureApplication(app);
  await app.init();
});
afterAll(async () => { if (app) await app.close(); });

test.each([
  [{ value: 'valid', extra: true }, 400, 'Bad Request'],
  [{ value: 'unauthorized' }, 401, 'Unauthorized'],
  [{ value: 'forbidden' }, 403, 'Forbidden'],
  [{ value: 'error' }, 500, 'Internal Server Error'],
])('test_ca_11_ca_13_problem_details_%s', async (body, status, title) => {
  const result = await request(app.getHttpServer()).post('/v1/fixture').send(body);
  expect(result.status).toBe(status);
  expect(result.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(result.body).toEqual({ type: 'about:blank', title, status });
});

test('test_ca_13_entrada_valida_chega_ao_handler', async () => {
  const result = await request(app.getHttpServer()).post('/v1/fixture').send({ value: 'valid' });
  expect(result.status).toBe(201);
  expect(result.body).toEqual({ value: 'valid' });
  expect(result.headers['x-content-type-options']).toBe('nosniff');
  expect(result.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});
