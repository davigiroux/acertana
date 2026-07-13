// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreatePoolPage } from './CreatePoolPage';
import type { ChainClient } from '../lib/chain/ChainClient';

const wallet = {
  address: 'ORGANIZER1',
  signMessage: vi.fn(async (m: Uint8Array) => m),
  signTransaction: vi.fn(async (tx: unknown) => tx),
};

const walletState = {
  authenticated: true,
  getAccessToken: async () => 'test-token',
  ready: true,
  address: 'ORGANIZER1',
  wallet,
  user: null,
  login: vi.fn(),
};

vi.mock('../lib/wallet/useInvisibleWallet', () => ({
  useInvisibleWallet: () => ({ ...walletState }),
}));

vi.mock('../lib/api', () => ({
  postCreatePool: vi.fn(async () => ({ joinCode: 'ABC123', poolPubkey: 'POOLPDA1' })),
  postFaucet: vi.fn(async () => undefined),
}));

import { postCreatePool, postFaucet } from '../lib/api';

const chain: ChainClient = {
  commitPick: vi.fn(),
  getEntry: vi.fn(async () => null),
  createPool: vi.fn(async () => 'POOLPDA1'),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CreatePoolPage', () => {
  it('faucets, creates on-chain, registers with backend, shows join link', async () => {
    render(<CreatePoolPage chainClient={chain} />);
    fireEvent.change(screen.getByLabelText('Nome do bolão'), {
      target: { value: 'Bolão dos amigos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar bolão' }));

    await waitFor(() => expect(screen.getByTestId('join-link')).toBeTruthy());
    expect(postFaucet).toHaveBeenCalledWith('ORGANIZER1', 'test-token');
    expect(chain.createPool).toHaveBeenCalledWith(
      expect.objectContaining({ organizer: 'ORGANIZER1', name: 'Bolão dos amigos' }),
    );
    expect(postCreatePool).toHaveBeenCalledWith(
      'Bolão dos amigos',
      'ORGANIZER1',
      'POOLPDA1',
      'test-token',
    );
    expect(screen.getByTestId('join-link').textContent).toContain('/j/ABC123');
  });

  it('surfaces chain errors and re-enables the button', async () => {
    (chain.createPool as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    render(<CreatePoolPage chainClient={chain} />);
    fireEvent.change(screen.getByLabelText('Nome do bolão'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar bolão' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('boom'));
    expect(postCreatePool).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Criar bolão' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('disables submit while name is empty', () => {
    render(<CreatePoolPage chainClient={chain} />);
    expect(
      (screen.getByRole('button', { name: 'Criar bolão' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
