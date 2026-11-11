require('reflect-metadata');
const { subject } = require('@casl/ability');
const { defer, lastValueFrom } = require('rxjs');
const { accessContext } = require('../dist/modules/auth/access-context');
const { AccessContextInterceptor } = require('../dist/modules/auth/access-context.interceptor');
const { MembershipService } = require('../dist/modules/auth/membership.service');

const contextFor = jwtIdentity => ({ switchToHttp: () => ({ getRequest: () => ({ jwtIdentity }) }) });

test('test_ca_11_rejeita_vinculo_ausente_antes_do_handler', async () => {
  const findUnique = jest.fn().mockResolvedValue(null);
  const interceptor = new AccessContextInterceptor(new MembershipService({ membership: { findUnique } }));
  const handler = { handle: jest.fn() };
  const identity = { userId: 'user', tenantId: 'tenant' };
  await expect(interceptor.intercept(contextFor(identity), handler)).rejects.toMatchObject({ status: 403 });
  expect(findUnique).toHaveBeenCalledWith({ where: { userId_tenantId: identity }, select: { role: true } });
  expect(handler.handle).not.toHaveBeenCalled();
});

test('test_ca_03_ca_05_ca_11_isola_contexto_concorrente_e_restringe_acoes', async () => {
  const identities = [{ userId: 'a', tenantId: 'x' }, { userId: 'b', tenantId: 'y' }];
  const interceptor = new AccessContextInterceptor({ resolve: async identity => ({
    ...identity, role: identity.userId === 'a' ? 'colaborador' : 'operacoes',
  }) });
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  let entered = 0;
  const results = await Promise.all(identities.map(async identity => {
    const result = await interceptor.intercept(contextFor(identity), { handle: () => defer(async () => {
      if (++entered === identities.length) release();
      await barrier;
      const current = accessContext.getStore();
      expect(current.ability.can('read', subject('Equipment', { tenantId: identity.tenantId }))).toBe(true);
      expect(current.ability.can('read', subject('Equipment', { tenantId: 'outside' }))).toBe(false);
      expect(current.ability.can('create', subject('Loan', { ...identity, userId: 'other' }))).toBe(false);
      expect(current.ability.can('read', subject('Loan', { ...identity, userId: 'other', returnedAt: null })))
        .toBe(identity.userId === 'b');
      return current.userId;
    }) });
    return lastValueFrom(result);
  }));
  expect(results).toEqual(['a', 'b']);
  expect(accessContext.getStore()).toBeUndefined();
});
