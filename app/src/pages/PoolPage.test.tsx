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
}));

import { deriveSalt, computeCommitment } from '../lib/commitment';
import { postPick } from '../lib/api';

const NOW = 1_781_000_000;
const POOL = 'POOLPUBKEY11';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return { fixtureId: 1001, home: 'Mexico', away: 'Poland', kickoffTs: NOW + 3600, ...overrides };
}

function mockChain(entry: Awaited<ReturnType<ChainClient['getEntry']>> = null): ChainClient {
  return {
    commitPick: vi.fn(async () => 'SIG'),
    getEntry: vi.fn(async () => entry),
  };
}

describe('PoolPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('commit flow: derives salt, computes commitment, sends tx, posts pick', async () => {
    const chain = mockChain();
    render(
      <PoolPage poolPubkey={POOL} chainClient={chain} fixtures={[fixture()]} nowTs={NOW} />,
    );

    fireEvent.change(screen.getByLabelText('Mexico vs Poland home goals'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Mexico vs Poland away goals'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => expect(postPick).toHaveBeenCalled());

    expect(deriveSalt).toHaveBeenCalledOnce();
    const [signFn, pool, fid] = vi.mocked(deriveSalt).mock.calls[0];
    expect(typeof signFn).toBe('function');
    expect(pool).toBe(POOL);
    expect(fid).toBe(1001n);

    expect(computeCommitment).toHaveBeenCalledWith(2, 1, SALT);

    expect(chain.commitPick).toHaveBeenCalledOnce();
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
    });

    // Marked committed in the UI.
    expect(await screen.findByText('committed')).toBeTruthy();
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
    expect(await screen.findByText('locked')).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: /commit/i })).toBeNull();
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
    expect(await screen.findByText(/Revealed: 3 – 2/)).toBeTruthy();
    expect(chain.getEntry).toHaveBeenCalledWith(POOL, 'PARTICIPANT1', 1001n);
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});
