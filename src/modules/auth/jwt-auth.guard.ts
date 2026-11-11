import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtVerifierService, type JwtIdentity } from './jwt-verifier.service';

interface JwtRequest {
  headers: { authorization?: string };
  jwtIdentity?: JwtIdentity;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: JwtVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<JwtRequest>();
    const token = request.headers.authorization?.match(/^Bearer ([^\s,]+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Credencial Bearer obrigatória');

    request.jwtIdentity = await this.verifier.verify(token);
    return true;
  }
}
