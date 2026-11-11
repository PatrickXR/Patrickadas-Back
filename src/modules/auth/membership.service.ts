import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtIdentity } from './jwt-verifier.service';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(identity: JwtIdentity) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: identity.userId, tenantId: identity.tenantId } },
      select: { role: true },
    });

    const role = membership?.role;
    if (role !== 'colaborador' && role !== 'operacoes') {
      throw new ForbiddenException('Vínculo de acesso inválido');
    }

    return { userId: identity.userId, tenantId: identity.tenantId, role: role as 'colaborador' | 'operacoes' };
  }
}
