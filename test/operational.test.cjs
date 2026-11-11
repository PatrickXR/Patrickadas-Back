require('reflect-metadata');
jest.mock('@sentry/node', () => ({ init: jest.fn(), captureMessage: jest.fn(), flush: jest.fn().mockResolvedValue(true) }));
const sentry = require('@sentry/node');
const { clientIp } = require('../dist/http/client-ip');
const { initializeErrorReporting, reportServerError } = require('../dist/http/error-reporting');

test('test_ca_009_03_untrusted_proxy_headers_do_not_change_local_ip', () => {
  expect(clientIp({ socket: { remoteAddress: '::ffff:127.0.0.1' },
    headers: { 'x-vercel-forwarded-for': '198.51.100.2', 'x-forwarded-for': '198.51.100.3' } }, false)).toBe('127.0.0.1');
});
test('test_ca_009_03_vercel_uses_platform_ip_and_rejects_ambiguous_headers', () => {
  const request = value => ({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-vercel-forwarded-for': value } });
  expect(clientIp(request('198.51.100.2'), true)).toBe('198.51.100.2');
  expect(clientIp(request('2001:db8::1'), true)).toBe('2001:db8::1');
  for (const value of [undefined, ['198.51.100.2'], '1.2.3.4, 5.6.7.8', 'bad', '1.2.3.4:80']) {
    expect(() => clientIp(request(value), true)).toThrow();
  }
});
test('test_ca_009_04_reporting_is_disabled_in_tests_and_scrubs_event_context', async () => {
  const previous = { node: process.env.NODE_ENV, dsn: process.env.SENTRY_DSN };
  try {
    process.env.SENTRY_DSN = 'https://fixture@example.invalid/1';
    process.env.NODE_ENV = 'test';
    initializeErrorReporting(); await reportServerError('request', 'tenant');
    expect(sentry.init).not.toHaveBeenCalled(); expect(sentry.captureMessage).not.toHaveBeenCalled();
    process.env.NODE_ENV = 'production';
    initializeErrorReporting(); await reportServerError('request', 'tenant');
    const options = sentry.init.mock.calls[0][0];
    expect(options.defaultIntegrations).toBe(false);
    expect(options.dataCollection.userInfo).toBe(false);
    expect(options.dataCollection.httpBodies).toEqual([]);
    const result = options.beforeSend({ event_id: 'event', message: 'password-secret',
      request: { headers: { Authorization: 'secret' } }, user: { email: 'private' },
      extra: { token: 'secret' }, breadcrumbs: [{ message: 'private' }], tags: { requestId: 'request', tenantId: 'tenant', password: 'secret' } });
    expect(JSON.stringify(result)).not.toMatch(/secret|private|Authorization|password/);
    expect(result.tags).toEqual({ requestId: 'request', tenantId: 'tenant' });
    expect(sentry.captureMessage).toHaveBeenCalledWith('Falha interna da API', { level: 'error', tags: { requestId: 'request', tenantId: 'tenant' } });
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  } finally {
    if (previous.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.node;
    if (previous.dsn === undefined) delete process.env.SENTRY_DSN; else process.env.SENTRY_DSN = previous.dsn;
  }
});
