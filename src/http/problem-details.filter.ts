import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { DomainError } from './domain-error';
import { reportServerError } from './error-reporting';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const title = STATUS_CODES[status] ?? 'HTTP Error';
    const response = host.switchToHttp().getResponse();
    if (status >= 500) await reportServerError(response.locals?.requestId, response.locals?.tenantId);
    response.status(status).type('application/problem+json').json({ type: 'about:blank', title, status,
      ...(exception instanceof DomainError ? { code: exception.code, detail: exception.detail } : {}),
    });
  }
}
