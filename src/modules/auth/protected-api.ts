import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { ValidatedApi } from '../../http/validated-api';
import { AccessContextInterceptor } from './access-context.interceptor';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IpLimitGuard, UserLimitInterceptor } from './request-limits';
import { ApiBearerAuth } from '@nestjs/swagger';

export function ProtectedApi() {
  return applyDecorators(
    ValidatedApi(),
    ApiBearerAuth(),
    UseGuards(IpLimitGuard, JwtAuthGuard),
    UseInterceptors(AccessContextInterceptor, UserLimitInterceptor),
  );
}
