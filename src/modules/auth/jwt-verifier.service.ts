import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface JwtIdentity {
  readonly userId: string;
  readonly tenantId: string;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

@Injectable()
export class JwtVerifierService {
  private readonly issuer: string;
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService) {
    const configuredUrl = config.getOrThrow<string>('SUPABASE_URL');
    if (!URL.canParse(configuredUrl)) throw new Error('SUPABASE_URL inválida');

    const url = new URL(configuredUrl);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
      || url.username || url.password || url.search || url.hash) {
      throw new Error('SUPABASE_URL inválida para validação de JWT');
    }

    url.pathname = `${url.pathname.replace(/\/+$/, '')}/auth/v1`;
    this.issuer = url.href;
    this.keys = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`), {
      timeoutDuration: 3_000,
      cacheMaxAge: 300_000,
      cooldownDuration: 30_000,
    });
  }

  async verify(token: string): Promise<JwtIdentity> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.keys, {
        algorithms: ['ES256', 'RS256'],
        issuer: this.issuer,
        audience: 'authenticated',
        requiredClaims: ['exp', 'sub', 'tenant_id'],
      }));
    } catch {
      throw new UnauthorizedException('Não foi possível validar a sessão');
    }

    if (!isUuid(payload.sub) || !isUuid(payload.tenant_id) || payload.role !== 'authenticated') {
      throw new UnauthorizedException('Não foi possível validar a sessão');
    }

    return { userId: payload.sub, tenantId: payload.tenant_id };
  }
}
