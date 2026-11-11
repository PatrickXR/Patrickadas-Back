import { AsyncLocalStorage } from 'node:async_hooks';
import { createMongoAbility } from '@casl/ability';
import type { MembershipService } from './membership.service';

type Membership = Awaited<ReturnType<MembershipService['resolve']>>;

export function createAbility(membership: Membership) {
  const { tenantId, userId, role } = membership;
  return createMongoAbility([
    { action: 'read', subject: 'Equipment', conditions: { tenantId } },
    { action: 'read', subject: 'Loan', conditions: { tenantId, userId } },
    { action: 'create', subject: 'Loan', conditions: { tenantId, userId } },
    ...(role === 'operacoes'
      ? [{ action: 'read', subject: 'Loan', conditions: { tenantId, returnedAt: null } }]
      : []),
  ]);
}

export const accessContext = new AsyncLocalStorage<Membership & { ability: ReturnType<typeof createAbility> }>();
