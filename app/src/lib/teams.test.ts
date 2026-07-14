import { describe, it, expect } from 'vitest';
import { teamName, teamFlag } from './teams';

describe('teamName', () => {
  it('translates known national teams to pt-BR', () => {
    expect(teamName('France')).toBe('França');
    expect(teamName('Spain')).toBe('Espanha');
    expect(teamName('England')).toBe('Inglaterra');
    expect(teamName('Argentina')).toBe('Argentina');
    expect(teamName('Switzerland')).toBe('Suíça');
    expect(teamName('Brazil')).toBe('Brasil');
    expect(teamName('Germany')).toBe('Alemanha');
    expect(teamName('Mexico')).toBe('México');
    expect(teamName('United States')).toBe('Estados Unidos');
    expect(teamName('South Korea')).toBe('Coreia do Sul');
  });

  it('passes through unknown names unchanged', () => {
    expect(teamName('Atlantis')).toBe('Atlantis');
    expect(teamName('')).toBe('');
  });
});

describe('teamFlag', () => {
  it('returns a flag emoji for known teams', () => {
    expect(teamFlag('France')).toBe('🇫🇷');
    expect(teamFlag('Brazil')).toBe('🇧🇷');
  });

  it('returns undefined for unknown names', () => {
    expect(teamFlag('Atlantis')).toBeUndefined();
  });
});
