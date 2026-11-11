import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { DomainError } from './domain-error';
import { reportServerError } from './error-reporting';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const title = STATUS_CODES[status] ?? 'HTTP Error';
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const safeDetail = status < 500 && typeof payload === 'object' && payload !== null
      && 'type' in payload && payload.type === 'about:blank' && 'detail' in payload && typeof payload.detail === 'string'
      ? payload.detail : undefined;
    const response = host.switchToHttp().getResponse();
    if (status >= 500) await reportServerError(response.locals?.requestId, response.locals?.tenantId);
    const publicTitle = safeDetail && typeof payload === 'object' && payload !== null && 'title' in payload && typeof payload.title === 'string' ? payload.title : title;
    response.status(status).type('application/problem+json').json({ type: 'about:blank', title: publicTitle, status,
      ...(exception instanceof DomainError ? { code: exception.code, detail: exception.detail } : safeDetail ? { detail: safeDetail } : {}),
    });
  }
}
