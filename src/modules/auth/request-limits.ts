import { CallHandler, CanActivate, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { RateLimitService } from '../../http/rate-limit.service';
import { accessContext } from './access-context';
import { clientIp } from '../../http/client-ip';

@Injectable()
export class IpLimitGuard implements CanActivate {
  constructor(private readonly limits: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const ip = clientIp(http.getRequest());
    this.limits.enforce(await this.limits.countIp(ip), 300, http.getResponse());
    return true;
  }
}

@Injectable()
export class UserLimitInterceptor implements NestInterceptor {
  constructor(private readonly limits: RateLimitService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const identity = accessContext.getStore();
    if (!identity) throw new UnauthorizedException();
    const bucket = await this.limits.countUser(identity.tenantId, identity.userId);
    this.limits.enforce(bucket, 120, context.switchToHttp().getResponse());
    return next.handle();
  }
}
