// Shared domain model used by both the API server and the web client.

export const USERS = ['eyal', 'ofir'] as const;
export type UserId = (typeof USERS)[number];

/** Ordered pipeline. `rejected` sits outside the flow. */
export const PIPELINE = [
  'pending_review',
  'relevant',
  'contacted',
  'responded',
  'approved',
  'proceed_with_owner',
  'contract',
] as const;

export type PipelineStatus = (typeof PIPELINE)[number];
export type Status = PipelineStatus | 'rejected';
export const ALL_STATUSES: Status[] = [...PIPELINE, 'rejected'];

export type ContactRole = 'contact' | 'owner' | 'agent';

export interface Contact {
  id: string;
  role: ContactRole;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface Comment {
  id: string;
  user: UserId;
  text: string;
  createdAt: string;
}

export type HistoryAction =
  | 'created'
  | 'vote_approve'
  | 'vote_reject'
  | 'vote_cleared'
  | 'advanced'
  | 'status_set'
  | 'restored'
  | 'edited';

export interface HistoryEntry {
  id: string;
  user: UserId | 'system';
  action: HistoryAction;
  from?: Status;
  to?: Status;
  at: string;
}

export type Vote = 'approve' | 'reject';

export interface Features {
  parking?: boolean;
  elevator?: boolean;
  balcony?: boolean;
  safeRoom?: boolean; // ממ"ד
  airConditioning?: boolean;
  furnished?: boolean;
  petsAllowed?: boolean;
  storage?: boolean;
  accessible?: boolean;
  renovated?: boolean;
}

export const FEATURE_KEYS: (keyof Features)[] = [
  'safeRoom',
  'parking',
  'elevator',
  'balcony',
  'airConditioning',
  'furnished',
  'petsAllowed',
  'storage',
  'accessible',
  'renovated',
];

export type ListingSource = 'yad2' | 'facebook' | 'madlan' | 'homeless' | 'friend' | 'other';

export interface ApartmentInput {
  title: string;
  city?: string;
  neighborhood?: string;
  address?: string;
  price?: number; // monthly rent, ₪
  arnona?: number; // monthly, ₪
  vaadBayit?: number; // monthly, ₪
  rooms?: number;
  sizeSqm?: number;
  floor?: number;
  totalFloors?: number;
  entryDate?: string; // yyyy-mm-dd
  viewingAt?: string; // ISO datetime of a scheduled viewing
  listingUrl?: string;
  source?: ListingSource;
  description?: string;
  images?: string[]; // URLs or compressed data URLs
  features?: Features;
  contacts?: Contact[];
}

/** Items on the in-person viewing checklist. */
export const CHECKLIST_KEYS = [
  'waterPressure',
  'hotWater',
  'noise',
  'mould',
  'phoneSignal',
  'light',
  'windows',
  'electricity',
  'airConditioner',
  'smell',
  'neighbors',
  'parkingArea',
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export type CheckState = 'ok' | 'issue';

export interface ChecklistItem {
  state?: CheckState;
  note?: string;
  by?: UserId;
  at?: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Commute {
  minutes: number; // driving
  km: number;
  /** True when the routing service was unreachable and this is a straight-line estimate. */
  estimated?: boolean;
}

export interface Apartment extends ApartmentInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserId;
  status: Status;
  /** Status the apartment was in before rejection, used for restore. */
  rejectedFrom?: PipelineStatus;
  /** Votes for the *current* status step. Reset whenever the status changes. */
  votes: Partial<Record<UserId, Vote>>;
  ratings: Partial<Record<UserId, number>>; // 1–5
  favorites: UserId[];
  images: string[];
  features: Features;
  contacts: Contact[];
  comments: Comment[];
  history: HistoryEntry[];
  checklist?: Partial<Record<ChecklistKey, ChecklistItem>>;
  /** Geocoded location; `query` is the address string it was resolved from. */
  geo?: GeoPoint & { query: string };
  /** Driving time from this apartment to each partner's workplace. */
  commute?: Partial<Record<UserId, Commute>>;
  /** Viewing reminders already pushed, as `${viewingAt}|${lead}` keys. */
  remindersSent?: string[];
}

export interface Workplace extends Partial<GeoPoint> {
  address: string;
}

export type BudgetBasis = 'rent' | 'total';

/** Shared, non-secret app settings. */
export interface Settings {
  budget?: { max?: number; basis: BudgetBasis };
  work: Partial<Record<UserId, Workplace>>;
}

/** What the client receives from GET /api/settings. */
export interface PublicSettings extends Settings {
  vapidPublicKey: string;
}

export interface ImportResult {
  data: Partial<ApartmentInput>;
  /** Which fields were found, for UI feedback. */
  found: (keyof ApartmentInput)[];
  /** Set when the site blocked us or nothing useful was found. */
  warning?: 'blocked' | 'empty';
}
