/** Thin backend API client. Base URL from VITE_BACKEND_URL. */

export function backendUrl(): string {
  const url = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (!url) throw new Error('VITE_BACKEND_URL is not set (see app/.env.example)');
  return url.replace(/\/$/, '');
}

/** Aggregate player count for the landing page's social proof. */
export async function getStats(): Promise<{ players: number }> {
  const res = await fetch(`${backendUrl()}/stats`);
  if (!res.ok) throw new Error(`stats lookup failed (${res.status})`);
  return res.json();
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

function authHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

export type JoinStatus = 'member' | 'pending';

export async function postJoin(
  poolPubkey: string,
  wallet: string,
  accessToken?: string,
  emailHint?: string,
): Promise<JoinStatus> {
  const res = await fetch(`${backendUrl()}/pools/${encodeURIComponent(poolPubkey)}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(accessToken) },
    // emailHint is a dev-mode fallback only — when auth is on, the backend
    // sources the email from the VERIFIED Privy identity and ignores this.
    body: JSON.stringify({ wallet, emailHint }),
  });
  if (!res.ok) throw new Error(`join failed (${res.status})`);
  const body = (await res.json()) as { status?: JoinStatus };
  return body.status ?? 'member';
}

export interface CreatePoolResult {
  joinCode: string;
  poolPubkey: string;
}

/** Register a freshly created on-chain pool; backend mints the join code. */
export async function postCreatePool(
  name: string,
  organizer: string,
  poolPubkey: string,
  accessToken?: string,
  requiresApproval?: boolean,
): Promise<CreatePoolResult> {
  const res = await fetch(`${backendUrl()}/pools`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ name, organizer, poolPubkey, requiresApproval: !!requiresApproval }),
  });
  if (!res.ok) throw new Error(`pool registration failed (${res.status})`);
  return res.json();
}

/** Ask the backend to top up the wallet with fee dust (devnet UX). */
export async function postFaucet(wallet: string, accessToken?: string): Promise<void> {
  const res = await fetch(`${backendUrl()}/faucet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) throw new Error(`faucet failed (${res.status})`);
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
export async function postPick(payload: PickPayload, accessToken?: string): Promise<void> {
  const res = await fetch(`${backendUrl()}/picks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`pick upload failed (${res.status})`);
}

export interface Standing {
  rank: number;
  wallet: string;
  points: number;
  exact: number;
  diff: number;
  result: number;
  scored: number;
  email?: string | null;
}

export interface Leaderboard {
  standings: Standing[];
  updatedAt: number;
  provisional: boolean;
}

/** Fetch the pool's live standings. Wallet+token prove membership → emails included. */
export async function getLeaderboard(
  poolPubkey: string,
  wallet?: string,
  accessToken?: string,
): Promise<Leaderboard> {
  const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
  const res = await fetch(
    `${backendUrl()}/pools/${encodeURIComponent(poolPubkey)}/leaderboard${qs}`,
    { headers: authHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`leaderboard fetch failed (${res.status})`);
  return res.json();
}

export interface PoolPick {
  wallet: string;
  email: string | null;
  home: number;
  away: number;
  points: number | null;
}

export interface PoolPicksFixture {
  fixtureId: number;
  result: { home: number; away: number; final: boolean } | null;
  picks: PoolPick[];
}

/** Everyone's revealed picks per fixture (post-kickoff only, by construction). */
export async function getPoolPicks(
  poolPubkey: string,
  wallet?: string,
  accessToken?: string,
): Promise<PoolPicksFixture[]> {
  const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
  const res = await fetch(`${backendUrl()}/pools/${encodeURIComponent(poolPubkey)}/picks${qs}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`pool picks fetch failed (${res.status})`);
  return (await res.json()).fixtures;
}

export interface MyPool {
  poolPubkey: string;
  name: string;
  joinedAt: number;
}

/** Pools a wallet has joined, newest first — powers the "Meus bolões" home list. */
export async function getMyPools(wallet: string, accessToken?: string): Promise<MyPool[]> {
  const res = await fetch(`${backendUrl()}/wallets/${encodeURIComponent(wallet)}/pools`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`pools fetch failed (${res.status})`);
  return (await res.json()).pools;
}

export interface PoolInfo {
  poolPubkey: string;
  name: string;
  organizer: string;
  joinCode?: string;
}

/** Pool name + (when the wallet proves membership) its invite join code. */
export async function getPoolInfo(
  poolPubkey: string,
  wallet?: string,
  accessToken?: string,
): Promise<PoolInfo> {
  const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
  const res = await fetch(`${backendUrl()}/pools/${encodeURIComponent(poolPubkey)}${qs}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`pool info fetch failed (${res.status})`);
  return res.json();
}

export interface JoinRequest {
  wallet: string;
  email: string | null;
  joinedAt: number;
}

/** Pending join requests for a pool (organizer-only). */
export async function getJoinRequests(
  poolPubkey: string,
  wallet: string,
  accessToken?: string,
): Promise<JoinRequest[]> {
  const res = await fetch(
    `${backendUrl()}/pools/${encodeURIComponent(poolPubkey)}/requests?wallet=${encodeURIComponent(wallet)}`,
    { headers: authHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`join requests fetch failed (${res.status})`);
  return (await res.json()).requests;
}

/** Approve or reject a pending join request (organizer-only). */
export async function postRequestAction(
  poolPubkey: string,
  wallet: string,
  action: 'approve' | 'reject',
  requesterWallet: string,
  accessToken?: string,
): Promise<void> {
  const res = await fetch(
    `${backendUrl()}/pools/${encodeURIComponent(poolPubkey)}/requests/${encodeURIComponent(requesterWallet)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(accessToken) },
      body: JSON.stringify({ wallet, action }),
    },
  );
  if (!res.ok) throw new Error(`request action failed (${res.status})`);
}
