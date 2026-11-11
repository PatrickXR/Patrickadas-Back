import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { accessContext } from '../auth/access-context';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainError } from '../../http/domain-error';

export type EquipmentInput = { nome: string; patrimonio: string; categoria: string; situacao: string; observacoes?: string };

export type CatalogQuery = { q: string; status: 'all' | 'disponivel' | 'emprestado' | 'manutencao'; limit: number; cursor?: string };

@Injectable()
export class EquipmentService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService) {}

  async list(query: CatalogQuery) {
    const identity = accessContext.getStore();
    if (!identity) throw new UnauthorizedException();
    const active = { returnedAt: null };
    const where: Prisma.EquipmentWhereInput = { tenantId: identity.tenantId };
    if (query.q) where.OR = ['nome', 'patrimonio'].map(field => ({ [field]: { contains: query.q, mode: 'insensitive' } }));
    if (query.status === 'manutencao') where.situacao = 'manutencao';
    if (query.status === 'emprestado') where.loans = { some: active };
    if (query.status === 'disponivel') {
      where.situacao = 'disponivel';
      where.loans = { none: active };
    }

    return this.db.$transaction(async tx => {
      if (query.cursor && !await tx.equipment.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } })) {
        throw new BadRequestException('Cursor inválido');
      }
      const rows = await tx.equipment.findMany({
        where, take: query.limit + 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: { id: true, nome: true, patrimonio: true, categoria: true, situacao: true, observacoes: true, imagePath: true,
          loans: { where: active, select: { userId: true } } },
      });
      const total = await tx.equipment.count({ where: { tenantId: identity.tenantId } });
      const available = await tx.equipment.count({ where: { tenantId: identity.tenantId, situacao: 'disponivel', loans: { none: active } } });
      const hasMore = rows.length > query.limit;
      const page = rows.slice(0, query.limit);
      const base = this.config.getOrThrow<string>('SUPABASE_URL').replace(/\/+$/, '');
      return {
        total, available,
        items: page.map(row => ({
          id: row.id, nome: row.nome, patrimonio: row.patrimonio, categoria: row.categoria,
          status: row.loans.length ? 'emprestado' : row.situacao,
          observacoes: row.observacoes,
          isMine: row.loans.some(loan => loan.userId === identity.userId),
          imageUrl: row.imagePath ? `${base}/storage/v1/object/public/equipment-images/${row.imagePath.split('/').map(encodeURIComponent).join('/')}` : null,
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async manage(input: EquipmentInput | null, id?: string) {
    const actor = accessContext.getStore();
    if (!actor || actor.role !== 'operacoes') throw new DomainError('forbidden', 'Acesso exclusivo de Operações.', 403);
    try {
      return await this.db.$transaction(async tx => {
        if (id) {
          const rows = await tx.$queryRaw<{ id: string }[]>`select id from public.equipment
            where id = ${id}::uuid and tenant_id = ${actor.tenantId}::uuid for update`;
          if (!rows.length) throw new DomainError('not_found', 'Equipamento não encontrado.', 404);
          if (await tx.loan.count({ where: { tenantId: actor.tenantId, equipmentId: id, ...(input ? { returnedAt: null } : {}) } })) {
            throw new DomainError('equipment_history', input ? 'Devolva o equipamento antes de editá-lo.' : 'Equipamento com histórico não pode ser excluído.', 409);
          }
        }
        const result = !input
          ? await tx.equipment.delete({ where: { tenantId_id: { tenantId: actor.tenantId, id: id! } }, select: { id: true } })
          : id ? await tx.equipment.update({ where: { tenantId_id: { tenantId: actor.tenantId, id } }, data: input, select: { id: true } })
          : await tx.equipment.create({ data: { ...input, tenantId: actor.tenantId }, select: { id: true } });
        const action = !input ? 'equipment.deleted' : id ? 'equipment.updated' : 'equipment.created';
        await tx.$executeRaw`insert into public.equipment_audit_events (tenant_id,actor_id,equipment_id,action)
          values (${actor.tenantId}::uuid,${actor.userId}::uuid,${result.id}::uuid,${action})`;
        return result;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('duplicate', 'Patrimônio já cadastrado neste tenant.', 409);
      }
      throw error;
    }
  }
}
