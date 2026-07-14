// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JoinPage } from './JoinPage';

const walletState = {
  authenticated: false,
  getAccessToken: async () => 'test-token',
  ready: false,
  address: null as string | null,
  wallet: null,
  user: null,
  login: vi.fn(),
};

vi.mock('../lib/wallet/useInvisibleWallet', () => ({
  useInvisibleWallet: () => ({ ...walletState }),
}));

vi.mock('../lib/api', () => ({
  getJoinInfo: vi.fn(),
  postJoin: vi.fn(),
}));

import { getJoinInfo, postJoin } from '../lib/api';

describe('JoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(walletState, {
      authenticated: false,
      ready: false,
      address: null,
      login: vi.fn(),
    });
    window.history.pushState(null, '', '/j/ABC123');
    vi.mocked(getJoinInfo).mockResolvedValue({ poolPubkey: 'POOLPUBKEY', name: 'Office Pool' });
    vi.mocked(postJoin).mockResolvedValue('member');
  });
  afterEach(cleanup);

  it('resolves code, logs in, fires join POST, navigates to pool page', async () => {
    const { rerender } = render(<JoinPage code="ABC123" />);

    expect(await screen.findByText(/Office Pool/)).toBeTruthy();
    expect(getJoinInfo).toHaveBeenCalledWith('ABC123');

    fireEvent.click(screen.getByRole('button', { name: /entrar com e-mail/i }));
    expect(walletState.login).toHaveBeenCalledOnce();

    // Simulate Privy finishing login + embedded wallet creation.
    Object.assign(walletState, { authenticated: true, ready: true, address: 'WALLET111' });
    rerender(<JoinPage code="ABC123" />);

    await waitFor(() => expect(postJoin).toHaveBeenCalledWith('POOLPUBKEY', 'WALLET111', 'test-token'));
    await waitFor(() => expect(window.location.pathname).toBe('/p/POOLPUBKEY'));
  });

  it('shows error for unknown code', async () => {
    vi.mocked(getJoinInfo).mockRejectedValue(new Error('join code lookup failed (404)'));
    render(<JoinPage code="NOPE" />);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('404'),
    );
  });

  it('shows a pending state instead of navigating when the pool requires approval', async () => {
    vi.mocked(postJoin).mockResolvedValue('pending');
    const { rerender } = render(<JoinPage code="ABC123" />);

    expect(await screen.findByText(/Office Pool/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /entrar com e-mail/i }));

    Object.assign(walletState, { authenticated: true, ready: true, address: 'WALLET111' });
    rerender(<JoinPage code="ABC123" />);

    expect(
      await screen.findByText(/Pedido enviado — aguardando aprovação do organizador/),
    ).toBeTruthy();
    expect(window.location.pathname).not.toBe('/p/POOLPUBKEY');
  });
});
