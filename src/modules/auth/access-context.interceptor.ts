import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { accessContext, createAbility } from './access-context';
import type { JwtIdentity } from './jwt-verifier.service';
import { MembershipService } from './membership.service';

@Injectable()
export class AccessContextInterceptor implements NestInterceptor {
  constructor(private readonly memberships: MembershipService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{ jwtIdentity?: JwtIdentity }>();
    if (!request.jwtIdentity) throw new UnauthorizedException('Identidade autenticada obrigatória');

    const membership = await this.memberships.resolve(request.jwtIdentity);
    const response = context.switchToHttp().getResponse?.<{ locals?: { tenantId?: string } }>();
    if (response?.locals) response.locals.tenantId = membership.tenantId;
    const store = { ...membership, ability: createAbility(membership) };
    return new Observable(subscriber => accessContext.run(store, () => next.handle().subscribe(subscriber)));
  }
}
