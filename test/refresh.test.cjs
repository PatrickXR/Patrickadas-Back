require('reflect-metadata');
const { ForbiddenException } = require('@nestjs/common');
const { AuthService } = require('../dist/modules/auth/auth.service');

test('test_ca_009_01_refresh_uses_current_membership_not_stale_role', async () => {
  const repo = { refresh: jest.fn().mockResolvedValue({ data: { session: { access_token: 'signed', refresh_token: 'rotated' }, user: { id: 'user' } } }) };
  const verifier = { verify: jest.fn().mockResolvedValue({ userId: 'user', tenantId: 'tenant' }) };
  const memberships = { resolve: jest.fn().mockResolvedValue({ role: 'colaborador' }) };
  const service = new AuthService(repo, verifier, memberships);
  await expect(service.refresh('opaque')).resolves.toEqual({ token: 'signed', refreshToken: 'rotated', userId: 'user', role: 'colaborador' });
  expect(memberships.resolve).toHaveBeenCalledWith({ userId: 'user', tenantId: 'tenant' });
  memberships.resolve.mockRejectedValue(new ForbiddenException());
  await expect(service.refresh('opaque')).rejects.toMatchObject({ status: 403 });
});

test('test_ca_009_01_refresh_rejects_identity_mismatch_before_membership_lookup', async () => {
  const repo = { refresh: jest.fn().mockResolvedValue({ data: { session: { access_token: 'signed' }, user: { id: 'user' } } }) };
  const memberships = { resolve: jest.fn() };
  const service = new AuthService(repo, { verify: async () => ({ userId: 'other', tenantId: 'tenant' }) }, memberships);
  await expect(service.refresh('opaque')).rejects.toMatchObject({ status: 401 });
  expect(memberships.resolve).not.toHaveBeenCalled();
});
