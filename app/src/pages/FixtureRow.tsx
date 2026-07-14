import { useState } from 'react';
import type { Fixture } from '../lib/fixtures';
import type { EntryState } from '../lib/chain/ChainClient';
import { describeCommitError } from '../lib/commitError';

export type FixtureStatus = 'open' | 'committed' | 'locked' | 'revealed';

export function fixtureStatus(
  fixture: Fixture,
  entry: EntryState | null,
  nowTs: number,
): FixtureStatus {
  if (entry?.revealed) return 'revealed';
  if (nowTs >= fixture.kickoffTs) return 'locked';
  return entry ? 'committed' : 'open';
}

export function kickoffTime(kickoffTs: number): string {
  return new Date(kickoffTs * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TeamRow({
  flag,
  name,
  children,
  dim,
}: {
  flag?: string;
  name: string;
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div className="ac-fx-row">
      <span className="ac-fx-flag" style={dim ? { filter: 'grayscale(.4)', opacity: 0.85 } : undefined}>
        {flag ?? '⚽'}
      </span>
      <span className="ac-fx-team" style={dim ? { color: '#7A7460' } : undefined}>
        {name}
      </span>
      {children}
    </div>
  );
}

export function FixtureRow({
  fixture,
  entry,
  nowTs,
  onCommit,
}: {
  fixture: Fixture;
  entry: EntryState | null;
  nowTs: number;
  onCommit: (fixtureId: number, homeGoals: number, awayGoals: number) => Promise<void>;
}) {
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = fixtureStatus(fixture, entry, nowTs);
  const label = `${fixture.home} vs ${fixture.away}`;
  const time = kickoffTime(fixture.kickoffTs);
  const step = (v: number, d: number) => Math.max(0, Math.min(9, v + d));

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCommit(fixture.fixtureId, home, away);
    } catch (e) {
      setError(describeCommitError(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'locked') {
    return (
      <div
        aria-label={label}
        style={{
          background: 'var(--amber-bg)',
          border: '1px solid var(--amber-border)',
          borderRadius: 16,
          padding: '13px 15px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="ac-fx-time" style={{ color: '#A99C7E' }}>⏱ {time}</span>
          <span className="ac-badge-late">Prazo encerrado</span>
        </div>
        <TeamRow flag={fixture.homeFlag} name={fixture.home} dim>
          <span className="ac-step-val" style={{ minWidth: 36, fontSize: 22, color: '#C3B893' }}>—</span>
        </TeamRow>
        <div className="ac-fx-divider" style={{ background: '#EFE6D0' }} />
        <TeamRow flag={fixture.awayFlag} name={fixture.away} dim>
          <span className="ac-step-val" style={{ minWidth: 36, fontSize: 22, color: '#C3B893' }}>—</span>
        </TeamRow>
        <div className="ac-fx-footnote" style={{ color: '#A9925A', fontWeight: 600, fontSize: 12 }}>
          Você não palpitou a tempo
        </div>
      </div>
    );
  }

  if (status === 'revealed' && entry) {
    return (
      <div aria-label={label} className="ac-card" style={{ padding: '13px 15px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span
            className="ac-condensed"
            style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.8px', color: 'var(--faint)', textTransform: 'uppercase' }}
          >
            Encerrado
          </span>
          <span className="ac-badge-saved">Seu palpite: {entry.homeGoals} – {entry.awayGoals}</span>
        </div>
        <TeamRow flag={fixture.homeFlag} name={fixture.home}>
          <span className="ac-score-box">{entry.homeGoals}</span>
        </TeamRow>
        <div className="ac-fx-divider" />
        <TeamRow flag={fixture.awayFlag} name={fixture.away}>
          <span className="ac-score-box">{entry.awayGoals}</span>
        </TeamRow>
      </div>
    );
  }

  if (status === 'committed') {
    return (
      <div aria-label={label} className="ac-card" style={{ padding: '13px 15px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="ac-fx-time">⏱ {time}</span>
          <span className="ac-badge-saved">🔒 Palpite salvo</span>
        </div>
        <TeamRow flag={fixture.homeFlag} name={fixture.home}>
          {/* Pick is committed on-chain as a hash; the score stays hidden until reveal. */}
          <span className="ac-score-box">•</span>
        </TeamRow>
        <div className="ac-fx-divider" />
        <TeamRow flag={fixture.awayFlag} name={fixture.away}>
          <span className="ac-score-box">•</span>
        </TeamRow>
        <div className="ac-fx-footnote">Palpite travado · resolve às {time}</div>
      </div>
    );
  }

  return (
    <div aria-label={label} className="ac-card" style={{ padding: '13px 15px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="ac-fx-time">⏱ {time}</span>
        <span className="ac-badge-open">Aberto</span>
      </div>
      <TeamRow flag={fixture.homeFlag} name={fixture.home}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            className="ac-step-btn"
            aria-label={`${label} home goals minus`}
            disabled={busy}
            onClick={() => setHome((v) => step(v, -1))}
          >
            −
          </button>
          <span className="ac-step-val" aria-label={`${label} home goals`}>{home}</span>
          <button
            className="ac-step-btn"
            aria-label={`${label} home goals plus`}
            disabled={busy}
            onClick={() => setHome((v) => step(v, 1))}
          >
            +
          </button>
        </div>
      </TeamRow>
      <div className="ac-fx-divider" />
      <TeamRow flag={fixture.awayFlag} name={fixture.away}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            className="ac-step-btn"
            aria-label={`${label} away goals minus`}
            disabled={busy}
            onClick={() => setAway((v) => step(v, -1))}
          >
            −
          </button>
          <span className="ac-step-val" aria-label={`${label} away goals`}>{away}</span>
          <button
            className="ac-step-btn"
            aria-label={`${label} away goals plus`}
            disabled={busy}
            onClick={() => setAway((v) => step(v, 1))}
          >
            +
          </button>
        </div>
      </TeamRow>
      {error && (
        <div className="ac-fx-error" role="alert">
          ⚠ {error}
        </div>
      )}
      <button className="ac-commit-btn" onClick={commit} disabled={busy}>
        {busy && <span className="ac-btn-spinner" />}
        {busy ? 'Salvando…' : error ? 'Tentar de novo' : 'Salvar palpite'}
      </button>
      <div className="ac-fx-footnote">🔒 Trava no apito · {time}</div>
    </div>
  );
}
