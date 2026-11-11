import * as Sentry from '@sentry/node';

export function initializeErrorReporting(): void {
  if (process.env.NODE_ENV === 'test' || !process.env.SENTRY_DSN) return;
  Sentry.init({ dsn: process.env.SENTRY_DSN,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
      urlQueryParams: false, databaseQueryData: false, queues: false, stackFrameVariables: false,
      frameContextLines: 0, graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false }, mcp: { inputs: false, outputs: false } },
    defaultIntegrations: false, tracesSampleRate: 0,
    beforeSend: event => ({ type: undefined, event_id: event.event_id, timestamp: event.timestamp,
      platform: event.platform, level: 'error', environment: event.environment,
      message: 'Falha interna da API', tags: {
        requestId: event.tags?.requestId, tenantId: event.tags?.tenantId,
      } }),
  });
}

export async function reportServerError(requestId?: string, tenantId?: string): Promise<void> {
  if (process.env.NODE_ENV === 'test' || !process.env.SENTRY_DSN) return;
  // Raw exceptions can contain SQL, passwords or tokens. Send only correlation identifiers.
  try {
    Sentry.captureMessage('Falha interna da API', { level: 'error', tags: { requestId, tenantId } });
    await Sentry.flush(2000);
  } catch { /* Reporting must never replace the original HTTP failure. */ }
}
