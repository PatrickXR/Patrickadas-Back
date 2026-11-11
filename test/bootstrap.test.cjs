const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('test_ca_07_cold_start_health_e_jwt_sem_require_de_esm', () => {
  const result = spawnSync(process.execPath, ['--no-experimental-require-module', '-e', `
    require('reflect-metadata');
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./dist/app.module');
    const { configureApplication } = require('./dist/configure-app');
    const { JwtVerifierService } = require('./dist/modules/auth/jwt-verifier.service');
    (async () => {
      const app = await NestFactory.create(AppModule, { logger: false });
      try {
        configureApplication(app);
        await app.listen(0, '127.0.0.1');
        const health = await fetch((await app.getUrl()) + '/health');
        if (health.status !== 200 || (await health.json()).status !== 'ok') throw Error('Health inválido');
        const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
        const { publicKey, privateKey } = await generateKeyPair('ES256');
        const jwk = { ...await exportJWK(publicKey), kid: 'bootstrap-fixture', alg: 'ES256' };
        const userId = '73000000-0000-4000-8000-000000000001';
        const tenantId = '73000000-0000-4000-8000-000000000002';
        const issuer = 'http://127.0.0.1:54321/auth/v1';
        const token = await new SignJWT({ tenant_id: tenantId, role: 'authenticated' })
          .setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).setIssuer(issuer)
          .setAudience('authenticated').setSubject(userId).setExpirationTime('2m').sign(privateKey);
        let reads = 0;
        globalThis.fetch = async url => {
          if (String(url) !== issuer + '/.well-known/jwks.json') throw Error('Rede externa proibida no teste');
          reads++; return Response.json({ keys: [jwk] });
        };
        const verifier = app.get(JwtVerifierService);
        for (let i = 0; i < 2; i++) {
          const identity = await verifier.verify(token);
          if (identity.userId !== userId || identity.tenantId !== tenantId) throw Error('JWT inválido');
        }
        if (reads !== 1) throw Error('Cache JWKS não reutilizado');
        console.log('BOOTSTRAP_OK health=200 jwt=valid jwks_reads=1');
      } finally { await app.close(); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 25000, windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'fixture-bootstrap-only',
      DATABASE_URL: 'postgresql://postgres:fixture-bootstrap-only@127.0.0.1:54333/postgres',
      DIRECT_URL: 'postgresql://postgres:fixture-bootstrap-only@127.0.0.1:54333/postgres' },
  });
  expect({ exitCode: result.status, error: result.stderr }).toEqual({ exitCode: 0, error: '' });
  expect(result.stdout).toContain('BOOTSTRAP_OK health=200 jwt=valid jwks_reads=1');
}, 30000);
