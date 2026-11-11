import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

export function clientIp(request: { socket: { remoteAddress?: string }; headers: Record<string, unknown> },
  onVercel = process.env.VERCEL === '1'): string {
  // Vercel overwrites this platform header. Outside its runtime, headers are untrusted.
  // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
  const address = onVercel ? request.headers['x-vercel-forwarded-for'] : request.socket.remoteAddress;
  if (typeof address !== 'string') throw new BadRequestException('Origem inválida');
  const ip = address.trim().replace(/^::ffff:(?=\d+\.)/i, '');
  // Reject lists, ports and malformed values rather than silently sharing a proxy bucket.
  if (!isIP(ip)) throw new BadRequestException('Origem inválida');
  return ip;
}
