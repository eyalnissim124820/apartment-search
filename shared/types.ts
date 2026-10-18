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
}
