import { postPick, type PickPayload } from './api';

/**
 * Local retry queue for pick payloads whose on-chain commit landed but whose
 * POST /picks failed (design §2: backend needs the payload to auto-reveal).
 */
const STORAGE_KEY = 'acertana.pendingPicks';

function load(): PickPayload[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as PickPayload[];
  } catch {
    return [];
  }
}

function save(queue: PickPayload[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueuePendingPick(payload: PickPayload): void {
  const queue = load().filter(
    (p) =>
      !(
        p.poolPubkey === payload.poolPubkey &&
        p.wallet === payload.wallet &&
        p.fixtureId === payload.fixtureId
      ),
  );
  queue.push(payload);
  save(queue);
}

/** Retry every queued pick; remove the ones that post successfully. */
export async function retryPendingPicks(post: typeof postPick = postPick): Promise<void> {
  const queue = load();
  if (queue.length === 0) return;
  const remaining: PickPayload[] = [];
  for (const payload of queue) {
    try {
      await post(payload);
    } catch {
      remaining.push(payload);
    }
  }
  save(remaining);
}
