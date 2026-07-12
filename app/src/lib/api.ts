/** Thin backend API client. Base URL from VITE_BACKEND_URL. */

export function backendUrl(): string {
  const url = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (!url) throw new Error('VITE_BACKEND_URL is not set (see app/.env.example)');
  return url.replace(/\/$/, '');
}

export interface JoinInfo {
  poolPubkey: string;
  name: string;
}

export async function getJoinInfo(code: string): Promise<JoinInfo> {
  const res = await fetch(`${backendUrl()}/j/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`join code lookup failed (${res.status})`);
  return res.json();
}

export async function postJoin(poolPubkey: string, wallet: string): Promise<void> {
  const res = await fetch(`${backendUrl()}/pools/${encodeURIComponent(poolPubkey)}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) throw new Error(`join failed (${res.status})`);
}

export interface PickPayload {
  poolPubkey: string;
  wallet: string;
  fixtureId: number;
  homeGoals: number;
  awayGoals: number;
  saltHex: string;
}

/** Store the pick payload (encrypted at rest by the backend) for auto-reveal. */
export async function postPick(payload: PickPayload): Promise<void> {
  const res = await fetch(`${backendUrl()}/picks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`pick upload failed (${res.status})`);
}
