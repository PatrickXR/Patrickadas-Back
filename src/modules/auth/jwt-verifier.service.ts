import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  private verification?: ReturnType<JwtVerifierService['loadVerification']>;

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
  }

  private async loadVerification() {
    // jose v6 is ESM-only. Keep native import() when emitting CommonJS:
    // Vercel's runtime rejects require('jose'), including on Node 24.
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const keys = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`), {
      timeoutDuration: 3_000,
      cacheMaxAge: 300_000,
      cooldownDuration: 30_000,
    });
    return { keys, jwtVerify };
  }

  async verify(token: string): Promise<JwtIdentity> {
    try {
      const { keys, jwtVerify } = await (this.verification ??= this.loadVerification());
      const { payload } = await jwtVerify(token, keys, {
        algorithms: ['ES256', 'RS256'],
        issuer: this.issuer,
        audience: 'authenticated',
        requiredClaims: ['exp', 'sub', 'tenant_id'],
      });
      if (!isUuid(payload.sub) || !isUuid(payload.tenant_id) || payload.role !== 'authenticated') {
        throw new Error('Identidade inválida');
      }
      return { userId: payload.sub, tenantId: payload.tenant_id };
    } catch {
      throw new UnauthorizedException('Não foi possível validar a sessão');
    }
  }
}
