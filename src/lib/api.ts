import type { Apartment, ApartmentInput, Contact, Status, UserId, Vote } from '../../shared/types';

let currentUser: UserId | null = null;
export const setApiUser = (u: UserId | null) => (currentUser = u);

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(currentUser ? { 'X-User': currentUser } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error, () => res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const apt = (id: string, sub = '') => `/apartments/${encodeURIComponent(id)}${sub}`;

export const api = {
  list: () => req<Apartment[]>('GET', '/apartments'),
  create: (input: ApartmentInput & { status?: Status }) => req<Apartment>('POST', '/apartments', input),
  /** Empty string clears a field. */
  update: (id: string, input: { [K in keyof ApartmentInput]?: ApartmentInput[K] | '' }) => req<Apartment>('PATCH', apt(id), input),
  remove: (id: string) => req<void>('DELETE', apt(id)),
  vote: (id: string, vote: Vote | null) => req<Apartment>('POST', apt(id, '/vote'), { vote }),
  setStatus: (id: string, status: Status) => req<Apartment>('POST', apt(id, '/status'), { status }),
  restore: (id: string) => req<Apartment>('POST', apt(id, '/restore')),
  rate: (id: string, rating: number) => req<Apartment>('POST', apt(id, '/rating'), { rating }),
  favorite: (id: string) => req<Apartment>('POST', apt(id, '/favorite')),
  saveContact: (id: string, c: Partial<Contact>) => req<Apartment>('POST', apt(id, '/contacts'), c),
  removeContact: (id: string, cid: string) => req<Apartment>('DELETE', apt(id, `/contacts/${cid}`)),
  comment: (id: string, text: string) => req<Apartment>('POST', apt(id, '/comments'), { text }),
  removeComment: (id: string, cid: string) => req<Apartment>('DELETE', apt(id, `/comments/${cid}`)),
};
