// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MyPoolsPage } from './MyPoolsPage';

const walletState = {
  authenticated: true,
  getAccessToken: async () => 'test-token',
  ready: true,
  address: 'PARTICIPANT1',
  wallet: null,
  user: null,
  login: vi.fn(),
};

vi.mock('../lib/wallet/useInvisibleWallet', () => ({
  useInvisibleWallet: () => ({ ...walletState }),
}));

vi.mock('../lib/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  getMyPools: vi.fn(async () => []),
}));

import { getMyPools } from '../lib/api';
import { navigate } from '../lib/router';

describe('MyPoolsPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('lists pools and navigates to a pool on click', async () => {
    vi.mocked(getMyPools).mockResolvedValueOnce([
      { poolPubkey: 'POOL1', name: 'Bolão dos amigos', joinedAt: 100 },
    ]);
    render(<MyPoolsPage />);

    await waitFor(() => expect(getMyPools).toHaveBeenCalledWith('PARTICIPANT1', 'test-token'));
    const card = await screen.findByText('Bolão dos amigos');
    fireEvent.click(card);
    expect(navigate).toHaveBeenCalledWith('/p/POOL1');
  });

  it('shows empty state and create-pool CTA', async () => {
    render(<MyPoolsPage />);
    expect(await screen.findByText('Você ainda não entrou em nenhum bolão.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Criar um bolão' }));
    expect(navigate).toHaveBeenCalledWith('/novo');
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(getMyPools).mockRejectedValueOnce(new Error('down'));
    render(<MyPoolsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('down');
  });
});
