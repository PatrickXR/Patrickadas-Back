import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { subject } from '@casl/ability';
import { accessContext } from '../auth/access-context';
import { LoansRepository } from './loans.repository';

@Injectable()
export class LoansService {
  constructor(private readonly repository: LoansRepository) {}
  async create(id: string) { this.authorize('create'); return this.repository.create(id); }
  async list(operations=false) { this.authorize('read', operations); return this.repository.list(operations); }
  async returnItem(id: string) { this.authorize('return'); return this.repository.returnItem(id); }
  private authorize(action: string, operations=false) {
    const actor=accessContext.getStore();
    if (!actor) throw new UnauthorizedException();
    if (operations && actor.role !== 'operacoes') throw new ForbiddenException();
    if (!actor.ability.can(action, subject('Loan', { tenantId: actor.tenantId, userId: actor.userId, returnedAt: null }))) throw new ForbiddenException();
  }
}
