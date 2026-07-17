/** Map raw commit-pick errors to human pt-BR messages for FixtureRow. */
export function describeCommitError(e: unknown): string {
  const message = String((e as Error)?.message ?? e ?? '');
  const lower = message.toLowerCase();

  if (
    lower.includes('insufficient') ||
    lower.includes('debit an account') ||
    lower.includes('no record of a prior credit')
  ) {
    return 'Sua carteira ainda está sendo preparada. Tente novamente em alguns segundos.';
  }
  if (message.includes('0x1772') || message.includes('FixtureLocked')) {
    return 'Este jogo já começou — palpites encerrados.';
  }
  if (
    lower.includes('accountnotinitialized') ||
    message.includes('0xbc4') ||
    message.includes('Error Number: 3012')
  ) {
    // The fixture has no on-chain Fixture PDA yet (registration lag).
    return 'Este jogo ainda não está liberado para palpites. Tente novamente em alguns minutos.';
  }
  if (lower.includes('already in use')) {
    return 'Você já enviou um palpite para este jogo.';
  }

  console.error('commit failed:', message);
  return 'Não foi possível enviar o palpite. Tente novamente.';
}
