import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { subject } from '@casl/ability';
import { accessContext } from '../auth/access-context';
import { EquipmentRepository, type CatalogQuery, type EquipmentInput } from './equipment.repository';
export type { CatalogQuery, EquipmentInput } from './equipment.repository';
@Injectable()
export class EquipmentService {
  constructor(private readonly repository: EquipmentRepository) {}
  async list(query: CatalogQuery) { this.authorize('read'); return this.repository.list(query); }
  async manage(input: EquipmentInput | null, id?: string) { this.authorize(!input ? 'delete' : id ? 'update' : 'create'); return this.repository.manage(input, id); }
  private authorize(action: string) {
    const actor=accessContext.getStore();
    if (!actor) throw new UnauthorizedException();
    if (!actor.ability.can(action, subject('Equipment', { tenantId: actor.tenantId }))) throw new ForbiddenException();
  }
}
