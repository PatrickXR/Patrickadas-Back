import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { accessContext } from '../auth/access-context';
import { DomainError } from '../../http/domain-error';
import { AuthRepository } from '../auth/auth.repository';

function identity() {
  const current = accessContext.getStore();
  if (!current) throw new UnauthorizedException();
  return current;
}

@Injectable()
export class LoansService {
  constructor(private readonly db: PrismaService, private readonly auth: AuthRepository) {}

  async create(equipmentId: string) {
    const actor = identity();
    try {
      return await this.db.$transaction(async tx => {
        const membership = await tx.$queryRaw<{ user_id: string }[]>`
          select user_id from public.memberships where user_id = ${actor.userId}::uuid
          and tenant_id = ${actor.tenantId}::uuid for update
        `;
        if (!membership.length) throw new DomainError('membership_invalid', 'Vínculo de acesso inválido.', 403);
        const items = await tx.$queryRaw<{ situacao: string }[]>`
          select situacao from public.equipment where id = ${equipmentId}::uuid
          and tenant_id = ${actor.tenantId}::uuid for update
        `;
        if (!items.length) throw new DomainError('not_found', 'Equipamento não encontrado.', 404);
        if (items[0].situacao !== 'disponivel'
          || await tx.loan.count({ where: { tenantId: actor.tenantId, equipmentId, returnedAt: null } })) {
          throw new DomainError('unavailable', 'O equipamento está indisponível.', 409);
        }
        const [time] = await tx.$queryRaw<{ now: Date; today: Date; due: Date }[]>`
          with moment as (select clock_timestamp() as instant)
          select instant as now, (instant at time zone 'America/Sao_Paulo')::date as today,
          (instant at time zone 'America/Sao_Paulo')::date + 14 as due from moment
        `;
        const own = { tenantId: actor.tenantId, userId: actor.userId, returnedAt: null };
        if (await tx.loan.count({ where: { ...own, dueOn: { lt: time.today } } })) {
          throw new DomainError('overdue', 'Devolva o item em atraso para solicitar outro.', 403);
        }
        if (await tx.loan.count({ where: own }) >= 3) {
          throw new DomainError('loan_limit', 'Limite de 3 itens em aberto atingido.', 403);
        }
        const loan = await tx.loan.create({ data: {
          tenantId: actor.tenantId, userId: actor.userId, equipmentId, borrowedAt: time.now, dueOn: time.due,
        }, select: { id: true, equipmentId: true, borrowedAt: true, dueOn: true } });
        await tx.auditEvent.create({ data: {
          tenantId: actor.tenantId, actorId: actor.userId, loanId: loan.id,
          action: 'loan.created', requestId: randomUUID(), occurredAt: time.now,
        } });
        return loan;
      }, { timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('unavailable', 'O equipamento acabou de ser emprestado.', 409);
      }
      throw error;
    }
  }

  async list(operations = false) {
    const actor = identity();
    if (operations && actor.role !== 'operacoes') throw new DomainError('forbidden', 'Acesso exclusivo de Operações.', 403);
    const rows = await this.db.loan.findMany({
      where: { tenantId: actor.tenantId, returnedAt: null, ...(operations ? {} : { userId: actor.userId }) },
      orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
      select: { id: true, userId: operations, borrowedAt: true, dueOn: true,
        equipment: { select: { id: true, nome: true, patrimonio: true, categoria: true } } },
    });
    if (!operations) return rows;
    const names = new Map(await Promise.all([...new Set(rows.map(row => row.userId))].map(async id => [id, await this.auth.displayName(id)] as const)));
    return rows.map(row => ({ ...row, userName: names.get(row.userId) }));
  }

  async returnItem(id: string) {
    const actor = identity();
    return this.db.$transaction(async tx => {
      const loan = await tx.loan.findFirst({ where: { id, tenantId: actor.tenantId,
        ...(actor.role === 'operacoes' ? {} : { userId: actor.userId }) } });
      if (!loan) throw new DomainError('not_found', 'Empréstimo não encontrado.', 404);
      await tx.$queryRaw`select user_id from public.memberships where user_id = ${loan.userId}::uuid
        and tenant_id = ${actor.tenantId}::uuid for update`;
      await tx.$queryRaw`select id from public.equipment where id = ${loan.equipmentId}::uuid
        and tenant_id = ${actor.tenantId}::uuid for update`;
      const result = await tx.loan.updateMany({ where: { id, tenantId: actor.tenantId, returnedAt: null },
        data: { returnedAt: new Date() } });
      if (result.count) await tx.auditEvent.create({ data: { tenantId: actor.tenantId, actorId: actor.userId,
        loanId: id, action: 'loan.returned', requestId: randomUUID() } });
      return { id, returned: true, changed: result.count === 1 };
    });
  }
}
