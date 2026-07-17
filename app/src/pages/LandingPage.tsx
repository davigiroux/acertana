import { Fragment } from 'react';
import { useInvisibleWallet } from '../lib/wallet/useInvisibleWallet';
import { navigate } from '../lib/router';
import './LandingPage.css';

const MATCHES = [
  {
    status: 'AO VIVO',
    statusColor: '#E5484D',
    time: "73'",
    home: { flag: '🇧🇷', code: 'BRA' },
    away: { flag: '🇦🇷', code: 'ARG' },
    score: '2 × 1',
    boxBg: '#EAEDFF',
    boxColor: '#2B4BFF',
  },
  {
    status: 'HOJE',
    statusColor: '#2B4BFF',
    time: '16:00',
    home: { flag: '🇫🇷', code: 'FRA' },
    away: { flag: '🇪🇸', code: 'ESP' },
    score: '— × —',
    boxBg: '#F1F2F6',
    boxColor: '#B0B5C2',
  },
  {
    status: 'HOJE',
    statusColor: '#2B4BFF',
    time: '19:00',
    home: { flag: '🇵🇹', code: 'POR' },
    away: { flag: '🇩🇪', code: 'ALE' },
    score: '— × —',
    boxBg: '#F1F2F6',
    boxColor: '#B0B5C2',
  },
];

const STEPS = [
  {
    num: '01',
    emoji: '📧',
    bg: '#EAEDFF',
    title: 'Entre com o e-mail',
    body: 'Sem senha para lembrar. Um código chega na sua caixa e pronto — você está dentro.',
  },
  {
    num: '02',
    emoji: '🔗',
    bg: '#E6F7EE',
    title: 'Crie e convide',
    body: 'Monte o bolão em segundos e compartilhe um link. A galera entra com um toque.',
  },
  {
    num: '03',
    emoji: '🏆',
    bg: '#FFF1DD',
    title: 'Palpite e dispute',
    body: 'Cravou os placares antes do apito e acompanhe o ranking subir a cada gol.',
  },
];

const RANKING = [
  { pos: 1, posColor: '#FFC53D', initial: 'M', avatarBg: '#2B4BFF', name: 'Marina', delta: '▲ 2', deltaColor: '#30A46C', pts: 38 },
  { pos: 2, posColor: '#C6CAD4', initial: 'R', avatarBg: '#7C5CFF', name: 'Rafael', delta: '▲ 1', deltaColor: '#30A46C', pts: 35 },
  { pos: 3, posColor: '#E8925C', initial: 'V', avatarBg: '#E5484D', name: 'Você', delta: '▼ 1', deltaColor: '#E5484D', pts: 33 },
  { pos: 4, posColor: '#5A6076', initial: 'J', avatarBg: '#30A46C', name: 'João', delta: '—', deltaColor: '#5A6076', pts: 29 },
];

const FEATURES = [
  { emoji: '⚡', bg: '#FFF1DD', title: 'Placares em tempo real', body: 'Resultados oficiais entram sozinhos. Nada de atualizar planilha na mão.' },
  { emoji: '🔒', bg: '#EAEDFF', title: 'Login sem senha', body: 'Só o e-mail. Uma carteira é criada nos bastidores, sem você precisar saber.' },
  { emoji: '📱', bg: '#E6F7EE', title: 'Feito pro celular', body: 'Palpite do sofá, do trabalho ou do estádio. Funciona liso em qualquer tela.' },
];

const SCORING = [
  { title: 'Placar exato', desc: 'Acertou os dois gols', pts: '+5' },
  { title: 'Vencedor + saldo', desc: 'Certo no time e na diferença', pts: '+3' },
  { title: 'Só o vencedor', desc: 'Acertou quem ganhou', pts: '+1' },
];

function Logo({ markSize, wordmarkClass, markClass }: { markSize: number; wordmarkClass: string; markClass: string }) {
  return (
    <div className="l-logo">
      <span
        className={markClass}
        style={{ width: markSize, height: markSize }}
      />
      <span className={wordmarkClass}>ACERTANA</span>
    </div>
  );
}

export function LandingPage() {
  const { login, authenticated, user } = useInvisibleWallet();
  const email = user?.email?.address ?? null;

  // Logged-in visitors don't need login/signup CTAs — show who they are
  // and a single "Ir ao App" action in every CTA slot instead.
  const goToApp = () => navigate('/home');

  return (
    <div className="landing">
      <nav className="l-nav">
        <div className="l-container l-nav-row">
          <Logo markSize={23} markClass="l-mark" wordmarkClass="l-wordmark" />
          <div className="l-nav-links">
            <a className="l-nav-link" href="#como">
              Como funciona
            </a>
            <a className="l-nav-link" href="#recursos">
              Recursos
            </a>
          </div>
          <div className="l-nav-actions">
            {authenticated ? (
              <>
                {email && <span className="l-user-email">{email}</span>}
                <button className="l-btn l-btn-primary" onClick={goToApp}>
                  Ir ao App
                </button>
              </>
            ) : (
              <>
                <button className="l-btn l-btn-ghost" onClick={login}>
                  Entrar
                </button>
                <button className="l-btn l-btn-primary" onClick={login}>
                  Criar conta
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="l-hero">
        <span className="l-hero-deco l-hero-ball" aria-hidden="true">
          ⚽
        </span>
        <span className="l-hero-deco l-hero-cup" aria-hidden="true">
          🏆
        </span>
        <div className="l-hero-glow" aria-hidden="true" />
        <div className="l-container l-hero-grid">
          <div className="l-hero-left">
            <div className="l-eyebrow-pill">
              <span className="l-eyebrow-dot" />
              <span>Bolão da Copa 2026</span>
            </div>
            <h1 className="l-h1">
              Palpite na Copa.
              <br />
              Dispute com
              <br />
              a galera.
            </h1>
            <p className="l-hero-sub">
              Crie um bolão em segundos, chame os amigos por um link e acompanhe o ranking em tempo real a cada
              gol. Sem senha, sem planilha, sem complicação.
            </p>
            <div className="l-cta-row">
              {authenticated ? (
                <>
                  <button className="l-btn l-btn-primary l-btn-lg" onClick={goToApp}>
                    Ir ao App
                  </button>
                  {email && <span className="l-user-email">Conectado como {email}</span>}
                </>
              ) : (
                <>
                  <button className="l-btn l-btn-primary l-btn-lg" onClick={login}>
                    Criar meu bolão
                  </button>
                  <button className="l-btn l-btn-secondary" onClick={login}>
                    Já tenho conta
                  </button>
                </>
              )}
            </div>
            <div className="l-social-proof">
              <span className="l-avatar-cluster">😀😎🤩😁</span>
              <span className="l-social-proof-text">+2.400 palpiteiros já estão dentro</span>
            </div>
          </div>
          <div className="l-hero-right">
            <div className="l-phone">
              <div className="l-phone-screen">
                <div className="l-phone-header">
                  <div className="l-phone-logo">
                    <span className="l-phone-mark" />
                    <span className="l-phone-wordmark">ACERTANA</span>
                  </div>
                  <span className="l-invite-pill">🔗 Convidar</span>
                </div>
                <div className="l-phone-body">
                  <div className="l-phone-title">Jogos de hoje</div>
                  {MATCHES.map((m) => (
                    <div className="l-match-card" key={`${m.home.code}-${m.away.code}`}>
                      <div className="l-match-top">
                        <span className="l-match-status" style={{ color: m.statusColor }}>
                          {m.status}
                        </span>
                        <span className="l-match-time">{m.time}</span>
                      </div>
                      <div className="l-match-main">
                        <div className="l-match-side">
                          <span className="l-match-flag">{m.home.flag}</span>
                          <span className="l-match-code">{m.home.code}</span>
                        </div>
                        <div className="l-match-score">
                          {m.score.split(' × ').map((val, i) => (
                            <Fragment key={i}>
                              {i === 1 && <span className="l-score-sep">×</span>}
                              <span className="l-score-box" style={{ background: m.boxBg, color: m.boxColor }}>
                                {val}
                              </span>
                            </Fragment>
                          ))}
                        </div>
                        <div className="l-match-side right">
                          <span className="l-match-flag">{m.away.flag}</span>
                          <span className="l-match-code">{m.away.code}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="l-trust">
        <div className="l-container l-trust-row">
          <span className="l-trust-label">FEITO PARA TODO TIPO DE BOLÃO</span>
          {['Copa do Mundo', 'Amigos', 'Escritório', 'Família'].map((tag) => (
            <span className="l-trust-tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section className="l-section" id="como">
        <div className="l-container">
          <div className="l-section-header">
            <span className="l-eyebrow">COMO FUNCIONA</span>
            <h2 className="l-h2">Do zero ao ranking em três passos</h2>
          </div>
          <div className="l-steps-grid">
            {STEPS.map((s) => (
              <div className="l-step-card" key={s.num}>
                <div className="l-step-head">
                  <div className="l-icon-tile" style={{ background: s.bg }}>
                    {s.emoji}
                  </div>
                  <span className="l-step-num">{s.num}</span>
                </div>
                <div className="l-card-title">{s.title}</div>
                <div className="l-card-body">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-features-section" id="recursos">
        <div className="l-container l-features-grid">
          <div className="l-ranking-card">
            <span className="l-ranking-eyebrow">RANKING AO VIVO</span>
            <h3 className="l-ranking-title">
              A cada gol, a
              <br />
              classificação muda
            </h3>
            <p className="l-ranking-p">
              Pontos atualizam em tempo real durante as partidas. Veja quem sobe, quem cai e quem cravou o
              placar.
            </p>
            <div className="l-ranking-table">
              {RANKING.map((r) => (
                <div className="l-ranking-row" key={r.pos}>
                  <span className="l-ranking-pos" style={{ color: r.posColor }}>
                    {r.pos}
                  </span>
                  <span className="l-ranking-avatar" style={{ background: r.avatarBg }}>
                    {r.initial}
                  </span>
                  <span className="l-ranking-name">{r.name}</span>
                  <span className="l-ranking-delta" style={{ color: r.deltaColor }}>
                    {r.delta}
                  </span>
                  <span className="l-ranking-pts">{r.pts}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="l-feature-cards">
            {FEATURES.map((f) => (
              <div className="l-feature-card" key={f.title}>
                <div className="l-icon-tile" style={{ background: f.bg, marginBottom: 14 }}>
                  {f.emoji}
                </div>
                <div className="l-card-title">{f.title}</div>
                <div className="l-card-body">{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-scoring-section">
        <div className="l-container">
          <div className="l-scoring-panel">
            <div>
              <span className="l-scoring-eyebrow">PONTUAÇÃO JUSTA</span>
              <h2 className="l-scoring-h2">
                Cravou o placar?
                <br />
                Leva o pote.
              </h2>
              <p className="l-scoring-p">
                Regras claras e iguais para todo mundo. Acertar o placar exato vale mais; acertar só o vencedor
                ainda pontua.
              </p>
            </div>
            <div className="l-scoring-rows">
              {SCORING.map((s) => (
                <div className="l-scoring-row" key={s.title}>
                  <div>
                    <div className="l-scoring-row-title">{s.title}</div>
                    <div className="l-scoring-row-desc">{s.desc}</div>
                  </div>
                  <span className="l-scoring-row-pts">{s.pts}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="l-cta-band">
        <div className="l-cta-glow" aria-hidden="true" />
        <div className="l-container l-cta-content">
          <h2 className="l-cta-h2">Pronto pro apito inicial?</h2>
          <p className="l-cta-p">
            Crie sua conta com o e-mail e monte seu bolão antes do primeiro jogo. Leva menos de um minuto.
          </p>
          <div className="l-cta-row">
            {authenticated ? (
              <>
                <button className="l-btn l-btn-primary l-btn-lg" onClick={goToApp}>
                  Ir ao App
                </button>
                {email && <span className="l-user-email l-user-email-inverse">Conectado como {email}</span>}
              </>
            ) : (
              <>
                <button className="l-btn l-btn-primary l-btn-lg" onClick={login}>
                  Criar conta grátis
                </button>
                <button className="l-btn l-btn-secondary" onClick={login}>
                  Entrar
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-container l-footer-row">
          <Logo markSize={20} markClass="l-footer-mark" wordmarkClass="l-footer-wordmark" />
          <span className="l-footer-copy">© 2026 Acertana · Bolão da Copa · Feito no Brasil 🇧🇷</span>
          <div className="l-footer-links">
            <a className="l-footer-link" href="/termos">
              Termos
            </a>
            <a className="l-footer-link" href="/privacidade">
              Privacidade
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
