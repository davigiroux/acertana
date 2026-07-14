import { describe, expect, it, vi } from 'vitest';
import { describeCommitError } from './commitError';

describe('describeCommitError', () => {
  it('maps insufficient funds to wallet-preparing message', () => {
    expect(describeCommitError(new Error('insufficient lamports'))).toBe(
      'Sua carteira ainda está sendo preparada. Tente novamente em alguns segundos.',
    );
  });

  it('maps "debit an account" to wallet-preparing message', () => {
    expect(describeCommitError(new Error('Attempt to debit an account but found no record of a prior credit'))).toBe(
      'Sua carteira ainda está sendo preparada. Tente novamente em alguns segundos.',
    );
  });

  it('maps FixtureLocked custom program error to lock message', () => {
    expect(describeCommitError(new Error('custom program error: 0x1772'))).toBe(
      'Este jogo já começou — palpites encerrados.',
    );
    expect(describeCommitError(new Error('Error Code: FixtureLocked'))).toBe(
      'Este jogo já começou — palpites encerrados.',
    );
  });

  it('maps "already in use" (Entry PDA exists) to duplicate-pick message', () => {
    expect(describeCommitError(new Error('Allocate: account Address already in use'))).toBe(
      'Você já enviou um palpite para este jogo.',
    );
  });

  it('falls back to a generic message and logs the raw error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(describeCommitError(new Error('boom'))).toBe(
      'Não foi possível enviar o palpite. Tente novamente.',
    );
    expect(spy).toHaveBeenCalledWith('commit failed:', 'boom');
    spy.mockRestore();
  });

  it('handles non-Error thrown values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(describeCommitError('plain string error')).toBe(
      'Não foi possível enviar o palpite. Tente novamente.',
    );
    spy.mockRestore();
  });
});
