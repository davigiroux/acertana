// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { bytesToHex } from '@noble/hashes/utils.js';
import { PoolPage } from './PoolPage';
import type { ChainClient } from '../lib/chain/ChainClient';
import type { Fixture } from '../lib/fixtures';

const SALT = new Uint8Array(32).fill(7);
const COMMITMENT = new Uint8Array(32).fill(9);

const wallet = {
  address: 'PARTICIPANT1',
  signMessage: vi.fn(async (m: Uint8Array) => m),
  signTransaction: vi.fn(async (tx: unknown) => tx),
};

const walletState = {
  authenticated: true,
  getAccessToken: async () => 'test-token',
  ready: true,
  address: 'PARTICIPANT1',
  wallet,
  user: null,
  login: vi.fn(),
};

vi.mock('../lib/wallet/useInvisibleWallet', () => ({
  useInvisibleWallet: () => ({ ...walletState }),
}));

vi.mock('../lib/commitment', () => ({
  deriveSalt: vi.fn(async () => SALT),
  computeCommitment: vi.fn(() => COMMITMENT),
}));

vi.mock('../lib/api', () => ({
  postPick: vi.fn(async () => undefined),
  postFaucet: vi.fn(async () => undefined),
  getLeaderboard: vi.fn(async () => ({ standings: [], updatedAt: 0, provisional: false })),
  getPoolInfo: vi.fn(async () => ({ poolPubkey: 'POOLPUBKEY11', name: 'P' })),
}));

import { deriveSalt, computeCommitment } from '../lib/commitment';
import { postPick, postFaucet, getLeaderboard, getPoolInfo } from '../lib/api';

const NOW = 1_781_000_000;
const POOL = 'POOLPUBKEY11';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return { fixtureId: 1001, home: 'Mexico', away: 'Poland', kickoffTs: NOW + 3600, ...overrides };
}

function mockChain(entry: Awaited<ReturnType<ChainClient['getEntry']>> = null): ChainClient {
  return {
    commitPick: vi.fn(async () => 'SIG'),
    createPool: vi.fn(async () => 'POOLPDA1'),
  getEntry: vi.fn(async () => entry),
  };
}

describe('PoolPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(cleanup);

  it('commit flow: derives salt, computes commitment, sends tx, posts pick', async () => {
    const chain = mockChain();
    render(
      <PoolPage poolPubkey={POOL} chainClient={chain} fixtures={[fixture()]} nowTs={NOW} />,
    );

    const plusHome = screen.getByRole('button', { name: 'México vs Polônia home goals plus' });
    fireEvent.click(plusHome);
    fireEvent.click(plusHome);
    fireEvent.click(screen.getByRole('button', { name: 'México vs Polônia away goals plus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar palpite' }));

    await waitFor(() => expect(postPick).toHaveBeenCalled());

    expect(deriveSalt).toHaveBeenCalledOnce();
    const [signFn, pool, fid] = vi.mocked(deriveSalt).mock.calls[0];
    expect(typeof signFn).toBe('function');
    expect(pool).toBe(POOL);
    expect(fid).toBe(1001n);

    expect(computeCommitment).toHaveBeenCalledWith(2, 1, SALT);

    expect(postFaucet).toHaveBeenCalledWith('PARTICIPANT1', 'test-token');
    expect(chain.commitPick).toHaveBeenCalledOnce();
    const faucetOrder = vi.mocked(postFaucet).mock.invocationCallOrder[0];
    const commitOrder = vi.mocked(chain.commitPick).mock.invocationCallOrder[0];
    expect(faucetOrder).toBeLessThan(commitOrder);
    const args = vi.mocked(chain.commitPick).mock.calls[0][0];
    expect(args.pool).toBe(POOL);
    expect(args.participant).toBe('PARTICIPANT1');
    expect(args.fixtureId).toBe(1001n);
    expect(args.commitment).toBe(COMMITMENT);

    expect(postPick).toHaveBeenCalledWith({
      poolPubkey: POOL,
      wallet: 'PARTICIPANT1',
      fixtureId: 1001,
      homeGoals: 2,
      awayGoals: 1,
      saltHex: bytesToHex(SALT),
    }, 'test-token');

    // Marked committed in the UI.
    expect(await screen.findByText(/Palpite salvo/)).toBeTruthy();
  });

  it('locked after kickoff: no inputs, no commit button', async () => {
    render(
      <PoolPage
        poolPubkey={POOL}
        chainClient={mockChain()}
        fixtures={[fixture({ kickoffTs: NOW - 60 })]}
        nowTs={NOW}
      />,
    );
    expect(await screen.findByText('Prazo encerrado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /salvar palpite/i })).toBeNull();
  });

  it('revealed entry renders the score', async () => {
    const chain = mockChain({ revealed: true, homeGoals: 3, awayGoals: 2 });
    render(
      <PoolPage
        poolPubkey={POOL}
        chainClient={chain}
        fixtures={[fixture({ kickoffTs: NOW - 7200 })]}
        nowTs={NOW}
      />,
    );
    expect(await screen.findByText(/Seu palpite: 3 – 2/)).toBeTruthy();
    expect(chain.getEntry).toHaveBeenCalledWith(POOL, 'PARTICIPANT1', 1001n);
    expect(screen.queryByRole('button', { name: /salvar palpite/i })).toBeNull();
  });

  it('committed entry: marker only, no re-commit affordance (Entry is init-only)', async () => {
    const chain = mockChain({ revealed: false, homeGoals: 0, awayGoals: 0 });
    render(
      <PoolPage poolPubkey={POOL} chainClient={chain} fixtures={[fixture()]} nowTs={NOW} />,
    );
    expect(await screen.findByText(/Palpite salvo/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /salvar palpite/i })).toBeNull();
  });

  it('failed postPick after commit: queued in localStorage, saved-locally notice', async () => {
    vi.mocked(postPick).mockRejectedValueOnce(new Error('backend down'));
    render(
      <PoolPage poolPubkey={POOL} chainClient={mockChain()} fixtures={[fixture()]} nowTs={NOW} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar palpite' }));

    expect(await screen.findByText(/saved locally, will retry/i)).toBeTruthy();
    expect(await screen.findByText(/Palpite salvo/)).toBeTruthy(); // chain commit landed
    const queue = JSON.parse(localStorage.getItem('acertana.pendingPicks') ?? '[]');
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ poolPubkey: POOL, wallet: 'PARTICIPANT1', fixtureId: 1001 });
  });

  it('pending pick retried on page load; cleared on success', async () => {
    const pending = {
      poolPubkey: POOL,
      wallet: 'PARTICIPANT1',
      fixtureId: 1001,
      homeGoals: 2,
      awayGoals: 1,
      saltHex: bytesToHex(SALT),
    };
    localStorage.setItem('acertana.pendingPicks', JSON.stringify([pending]));
    render(
      <PoolPage poolPubkey={POOL} chainClient={mockChain()} fixtures={[fixture()]} nowTs={NOW} />,
    );
    await waitFor(() => expect(postPick).toHaveBeenCalledWith(pending, 'test-token'));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('acertana.pendingPicks') ?? '[]')).toHaveLength(0),
    );
  });

  it('ranking tab: fetches and lists standings, marks own row, shows provisional badge', async () => {
    vi.mocked(getLeaderboard).mockResolvedValueOnce({
      standings: [
        { rank: 1, wallet: 'PARTICIPANT1', points: 8, exact: 1, diff: 1, result: 0, scored: 2 },
        { rank: 2, wallet: 'OtherWallet1', points: 1, exact: 0, diff: 0, result: 1, scored: 2 },
      ],
      updatedAt: 42,
      provisional: true,
    });
    render(
      <PoolPage poolPubkey={POOL} chainClient={mockChain()} fixtures={[fixture()]} nowTs={NOW} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ranking' }));

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith(POOL));
    expect(await screen.findByText(/você/)).toBeTruthy();
    expect(screen.getByText(/provisório/)).toBeTruthy();
    expect(screen.getByText('8 pts')).toBeTruthy();
    expect(screen.getByText('1 pts')).toBeTruthy();
  });

  it('ranking tab: empty state when no one has scored', async () => {
    vi.mocked(getLeaderboard).mockResolvedValueOnce({
      standings: [],
      updatedAt: 0,
      provisional: false,
    });
    render(
      <PoolPage poolPubkey={POOL} chainClient={mockChain()} fixtures={[fixture()]} nowTs={NOW} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ranking' }));
    expect(await screen.findByText('Ninguém pontuou ainda')).toBeTruthy();
  });

  it('share: shows Convidar button once joinCode resolves, copies link on click', async () => {
    vi.mocked(getPoolInfo).mockResolvedValueOnce({
      poolPubkey: POOL,
      name: 'P',
      joinCode: 'ABC123',
    });
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <PoolPage poolPubkey={POOL} chainClient={mockChain()} fixtures={[fixture()]} nowTs={NOW} />,
    );

    const button = await screen.findByRole('button', { name: 'Convidar' });
    fireEvent.click(button);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/j/ABC123`),
    );
    expect(await screen.findByText('Link copiado ✓')).toBeTruthy();
  });

  it('share: hides Convidar button when the wallet has no join code access', async () => {
    render(
      <PoolPage poolPubkey={POOL} chainClient={mockChain()} fixtures={[fixture()]} nowTs={NOW} />,
    );
    await waitFor(() => expect(getPoolInfo).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Convidar' })).toBeNull();
  });
});
