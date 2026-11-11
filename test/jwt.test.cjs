require('reflect-metadata');

const { ConfigService } = require('@nestjs/config');
const { SignJWT, exportJWK, generateKeyPair, generateSecret } = require('jose');
const { JwtAuthGuard } = require('../dist/modules/auth/jwt-auth.guard');
const { JwtVerifierService } = require('../dist/modules/auth/jwt-verifier.service');

const issuer = 'http://127.0.0.1:54321/auth/v1';
const userId = '62000000-0000-4000-8000-000000000001';
const tenantId = '62000000-0000-4000-8000-000000000002';
const otherTenant = '62000000-0000-4000-8000-000000000003';
const rejected = { status: 401 };
let first;
let second;
let rsa;

async function key(algorithm, kid) {
  const { publicKey, privateKey } = await generateKeyPair(algorithm);
  return { privateKey, jwk: { ...await exportJWK(publicKey), kid, alg: algorithm, use: 'sig' } };
}

function sign(claims = {}, signingKey = first, kid = signingKey.jwk.kid) {
  return new SignJWT({
    iss: issuer, aud: 'authenticated', sub: userId, tenant_id: tenantId,
    role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 120, ...claims,
  }).setProtectedHeader({ alg: signingKey.jwk.alg, kid }).sign(signingKey.privateKey);
}

const makeVerifier = () => new JwtVerifierService(new ConfigService({ SUPABASE_URL: 'http://127.0.0.1:54321/' }));
const jwks = (...keys) => Response.json({ keys: keys.map(entry => entry.jwk) });
const contextFor = request => ({ switchToHttp: () => ({ getRequest: () => request }) });

beforeAll(async () => {
  [first, second, rsa] = await Promise.all([key('ES256', 'first'), key('ES256', 'second'), key('RS256', 'rsa')]);
});
afterEach(() => jest.restoreAllMocks());

test('test_ca_01_ca_11_guard_usa_identidade_assinada_e_reutiliza_jwks', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jwks(first, rsa));
  const verifier = makeVerifier();
  const guard = new JwtAuthGuard(verifier);
  const request = {
    headers: { authorization: `Bearer ${await sign()}`, 'x-tenant-id': otherTenant },
    body: { tenant_id: otherTenant, role: 'operacoes' },
  };

  await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  expect(request.jwtIdentity).toEqual({ userId, tenantId });
  await expect(verifier.verify(await sign({}, rsa))).resolves.toEqual({ userId, tenantId });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(`${issuer}/.well-known/jwks.json`, expect.objectContaining({ redirect: 'manual' }));
});

test.each([
  ['emissor', { iss: 'https://issuer.example.invalid/auth/v1' }],
  ['audiência', { aud: 'anon' }],
  ['expirado', { exp: 1 }],
  ['sem expiração', { exp: undefined }],
  ['ainda inválido', { nbf: 4102444800 }],
  ['sem tenant', { tenant_id: undefined }],
  ['tenant inválido', { tenant_id: 'invalid' }],
  ['subject inválido', { sub: 'invalid' }],
  ['role incompatível', { role: 'service_role' }],
])('test_ca_01_ca_11_rejeita_claim_%s', async (_case, claims) => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jwks(first));
  await expect(makeVerifier().verify(await sign(claims))).rejects.toMatchObject(rejected);
});

test('test_ca_11_rejeita_assinatura_de_outra_chave_e_algoritmo_simétrico', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jwks(first));
  const verifier = makeVerifier();
  await expect(verifier.verify(await sign({}, second, first.jwk.kid))).rejects.toMatchObject(rejected);
  const secret = await generateSecret('HS256');
  await expect(verifier.verify(await sign({}, { privateKey: secret, jwk: { alg: 'HS256', kid: 'symmetric' } })))
    .rejects.toMatchObject(rejected);
});

test.each([undefined, 'Basic abc', 'Bearer first, Bearer second'])('test_ca_01_ca_11_rejeita_header_invalido_%s', async authorization => {
  const fetch = jest.spyOn(globalThis, 'fetch');
  const request = { headers: { authorization } };
  await expect(new JwtAuthGuard(makeVerifier()).canActivate(contextFor(request))).rejects.toMatchObject(rejected);
  expect(fetch).not.toHaveBeenCalled();
  expect(request.jwtIdentity).toBeUndefined();
});

test('test_ca_11_atualiza_jwks_na_rotacao_e_rejeita_chave_retirada', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch')
    .mockImplementationOnce(async () => jwks(first))
    .mockImplementationOnce(async () => jwks(second));
  const verifier = makeVerifier();
  const original = await sign();
  const rotated = await sign({}, second);

  await expect(verifier.verify(original)).resolves.toEqual({ userId, tenantId });
  await expect(verifier.verify(rotated)).rejects.toMatchObject(rejected);
  expect(fetch).toHaveBeenCalledTimes(1);

  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
  await expect(verifier.verify(rotated)).resolves.toEqual({ userId, tenantId });
  await expect(verifier.verify(original)).rejects.toMatchObject(rejected);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('test_ca_11_falha_fechada_com_cache_vencido_e_jwks_indisponivel', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch')
    .mockImplementationOnce(async () => jwks(first))
    .mockImplementationOnce(async () => new Response(null, { status: 503 }));
  const verifier = makeVerifier();
  const token = await sign({}, first);

  await expect(verifier.verify(token)).resolves.toEqual({ userId, tenantId });
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 301_000);
  await expect(verifier.verify(token)).rejects.toMatchObject(rejected);
  expect(fetch).toHaveBeenCalledTimes(2);
});
