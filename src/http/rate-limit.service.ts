import { HttpException, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';

type Bucket = { hit_count: bigint; retry_after: number };

@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async countIp(address: string): Promise<Bucket> {
    if (!isIP(address) || address.includes('%')) throw new Error('Endereço remoto inválido');
    const [bucket] = await this.prisma.$queryRaw<Bucket[]>`
      with hit as (
        insert into public.rate_limit_buckets (scope, ip_address, window_start)
        values ('ip', ${address}::inet, date_trunc('minute', statement_timestamp()))
        on conflict (ip_address, window_start) where scope = 'ip'
        do update set hit_count = least(rate_limit_buckets.hit_count, 300) + 1
        returning hit_count, window_start
      )
      select hit_count, ceil(extract(epoch from window_start + interval '1 minute' - statement_timestamp()))::int as retry_after
      from hit
    `;
    return bucket;
  }

  async countUser(tenantId: string, userId: string): Promise<Bucket> {
    const [bucket] = await this.prisma.$queryRaw<Bucket[]>`
      with hit as (
        insert into public.rate_limit_buckets (scope, tenant_id, user_id, window_start)
        values ('user', ${tenantId}::uuid, ${userId}::uuid, date_trunc('minute', statement_timestamp()))
        on conflict (tenant_id, user_id, window_start) where scope = 'user'
        do update set hit_count = least(rate_limit_buckets.hit_count, 120) + 1
        returning hit_count, window_start
      )
      select hit_count, ceil(extract(epoch from window_start + interval '1 minute' - statement_timestamp()))::int as retry_after
      from hit
    `;
    return bucket;
  }

  enforce(bucket: Bucket, limit: 120 | 300, response: { setHeader(name: string, value: string): void }): void {
    if (bucket.hit_count <= BigInt(limit)) return;
    response.setHeader('Retry-After', String(bucket.retry_after));
    throw new HttpException('Limite de requisições atingido', 429);
  }
}
