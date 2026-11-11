const { validateEnvironment } = require('../dist/environment');
const fixture = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
  DATABASE_URL: 'postgresql://postgres:fixture-only@127.0.0.1:54333/postgres',
  DIRECT_URL: 'postgresql://postgres:fixture-only@127.0.0.1:54333/postgres' };
test('CA-13 configuração inválida falha no boot sem revelar credenciais', () => {
  expect(validateEnvironment(fixture).PORT).toBe(3000);
  expect(() => validateEnvironment({ ...fixture, DATABASE_URL: 'secret-invalid-url' })).toThrow('DATABASE_URL');
  try { validateEnvironment({ ...fixture, DATABASE_URL: 'secret-invalid-url', DIRECT_URL: undefined }); }
  catch (error) { expect(error.message).not.toMatch(/secret-invalid-url|fixture-only/); }
});
