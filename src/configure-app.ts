import { INestApplication, RequestMethod } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import pino from 'pino';
import { initializeErrorReporting } from './http/error-reporting';

export function configureApplication(app: INestApplication): void {
  initializeErrorReporting();
  const logger = pino({ base: null, level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' });
  app.use(helmet());
  app.use((request: { method: string }, response: {
    locals: { tenantId?: string; requestId?: string };
    statusCode: number;
    setHeader(name: string, value: string): void;
    once(event: 'finish', handler: () => void): void;
  }, next: () => void) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    const start = performance.now();
    response.setHeader('X-Request-ID', requestId);
    response.once('finish', () => {
      logger.info({ requestId, tenantId: response.locals.tenantId, method: request.method,
        status: response.statusCode, durationMs: Math.round(performance.now() - start) }, 'HTTP request');
    });
    next();
  });
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'v1/health', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: true,
  });
}
