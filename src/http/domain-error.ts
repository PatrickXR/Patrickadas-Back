import { HttpException } from '@nestjs/common';

export class DomainError extends HttpException {
  constructor(public readonly code: string, public readonly detail: string, status: number) {
    super(detail, status);
  }
}
