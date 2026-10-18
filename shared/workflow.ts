import { PIPELINE, USERS, type Apartment, type PipelineStatus, type Settings, type Status, type UserId } from './types';

export function nextStatus(status: Status): PipelineStatus | null {
  if (status === 'rejected') return null;
  const i = PIPELINE.indexOf(status);
  return i >= 0 && i < PIPELINE.length - 1 ? PIPELINE[i + 1] : null;
}

export function statusIndex(status: Status): number {
  return status === 'rejected' ? -1 : PIPELINE.indexOf(status);
}

export function otherUser(user: UserId): UserId {
  return USERS.find((u) => u !== user)!;
}

/** True when this user still has to vote on the apartment's current step. */
export function awaitsVoteFrom(apt: Apartment, user: UserId): boolean {
  return nextStatus(apt.status) !== null && !apt.votes[user];
}

/** Statuses at which moving forward should prompt for the owner's details. */
export const OWNER_STATUSES: Status[] = ['proceed_with_owner', 'contract'];

export function hasOwner(apt: Apartment): boolean {
  return apt.contacts.some((c) => c.role === 'owner');
}

export function totalMonthly(apt: Pick<Apartment, 'price' | 'arnona' | 'vaadBayit'>): number | undefined {
  if (apt.price == null) return undefined;
  return apt.price + (apt.arnona ?? 0) + (apt.vaadBayit ?? 0);
}

/** Amount over the shared budget cap, or 0 when within budget / no cap set. */
export function overBudget(
  apt: Pick<Apartment, 'price' | 'arnona' | 'vaadBayit'>,
  budget: Settings['budget'],
): number {
  if (!budget?.max) return 0;
  const cost = budget.basis === 'total' ? totalMonthly(apt) : apt.price;
  return cost != null && cost > budget.max ? cost - budget.max : 0;
}

/** Address string used for geocoding, most specific first. */
export function geoQuery(apt: Pick<Apartment, 'address' | 'neighborhood' | 'city'>): string {
  return [apt.address, apt.neighborhood, apt.city].filter(Boolean).join(', ');
}
