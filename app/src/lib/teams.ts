/**
 * App-side pt-BR localization for national team names.
 * Backend/TxLINE sends English names verbatim; we translate for display only.
 * Unknown names pass through unchanged.
 */

interface TeamInfo {
  name: string;
  flag: string;
}

const TEAMS: Record<string, TeamInfo> = {
  France: { name: 'França', flag: '🇫🇷' },
  Spain: { name: 'Espanha', flag: '🇪🇸' },
  England: { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  Argentina: { name: 'Argentina', flag: '🇦🇷' },
  Switzerland: { name: 'Suíça', flag: '🇨🇭' },
  Brazil: { name: 'Brasil', flag: '🇧🇷' },
  Germany: { name: 'Alemanha', flag: '🇩🇪' },
  Mexico: { name: 'México', flag: '🇲🇽' },
  Canada: { name: 'Canadá', flag: '🇨🇦' },
  Morocco: { name: 'Marrocos', flag: '🇲🇦' },
  Japan: { name: 'Japão', flag: '🇯🇵' },
  'United States': { name: 'Estados Unidos', flag: '🇺🇸' },
  USA: { name: 'Estados Unidos', flag: '🇺🇸' },
  Senegal: { name: 'Senegal', flag: '🇸🇳' },
  Denmark: { name: 'Dinamarca', flag: '🇩🇰' },
  Australia: { name: 'Austrália', flag: '🇦🇺' },
  'South Korea': { name: 'Coreia do Sul', flag: '🇰🇷' },
  Ecuador: { name: 'Equador', flag: '🇪🇨' },
  Poland: { name: 'Polônia', flag: '🇵🇱' },
  Portugal: { name: 'Portugal', flag: '🇵🇹' },
  Netherlands: { name: 'Holanda', flag: '🇳🇱' },
  Belgium: { name: 'Bélgica', flag: '🇧🇪' },
  Croatia: { name: 'Croácia', flag: '🇭🇷' },
  Uruguay: { name: 'Uruguai', flag: '🇺🇾' },
  Colombia: { name: 'Colômbia', flag: '🇨🇴' },
  Chile: { name: 'Chile', flag: '🇨🇱' },
  Peru: { name: 'Peru', flag: '🇵🇪' },
  Paraguay: { name: 'Paraguai', flag: '🇵🇾' },
  Venezuela: { name: 'Venezuela', flag: '🇻🇪' },
  Bolivia: { name: 'Bolívia', flag: '🇧🇴' },
  'Costa Rica': { name: 'Costa Rica', flag: '🇨🇷' },
  Panama: { name: 'Panamá', flag: '🇵🇦' },
  Honduras: { name: 'Honduras', flag: '🇭🇳' },
  Jamaica: { name: 'Jamaica', flag: '🇯🇲' },
  Ghana: { name: 'Gana', flag: '🇬🇭' },
  Nigeria: { name: 'Nigéria', flag: '🇳🇬' },
  Cameroon: { name: 'Camarões', flag: '🇨🇲' },
  Tunisia: { name: 'Tunísia', flag: '🇹🇳' },
  Algeria: { name: 'Argélia', flag: '🇩🇿' },
  Egypt: { name: 'Egito', flag: '🇪🇬' },
  'South Africa': { name: 'África do Sul', flag: '🇿🇦' },
  "Ivory Coast": { name: 'Costa do Marfim', flag: '🇨🇮' },
  Italy: { name: 'Itália', flag: '🇮🇹' },
  Scotland: { name: 'Escócia', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  Wales: { name: 'País de Gales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  Ireland: { name: 'Irlanda', flag: '🇮🇪' },
  Austria: { name: 'Áustria', flag: '🇦🇹' },
  Serbia: { name: 'Sérvia', flag: '🇷🇸' },
  Turkey: { name: 'Turquia', flag: '🇹🇷' },
  Greece: { name: 'Grécia', flag: '🇬🇷' },
  Sweden: { name: 'Suécia', flag: '🇸🇪' },
  Norway: { name: 'Noruega', flag: '🇳🇴' },
  Russia: { name: 'Rússia', flag: '🇷🇺' },
  Ukraine: { name: 'Ucrânia', flag: '🇺🇦' },
  Qatar: { name: 'Catar', flag: '🇶🇦' },
  'Saudi Arabia': { name: 'Arábia Saudita', flag: '🇸🇦' },
  Iran: { name: 'Irã', flag: '🇮🇷' },
  Iraq: { name: 'Iraque', flag: '🇮🇶' },
  China: { name: 'China', flag: '🇨🇳' },
  India: { name: 'Índia', flag: '🇮🇳' },
  'New Zealand': { name: 'Nova Zelândia', flag: '🇳🇿' },
  Vietnam: { name: 'Vietnã', flag: '🇻🇳' },
  Myanmar: { name: 'Mianmar', flag: '🇲🇲' },
};

export function teamName(en: string): string {
  return TEAMS[en]?.name ?? en;
}

export function teamFlag(en: string): string | undefined {
  return TEAMS[en]?.flag;
}

/** pt-BR broadcast-style trigrams that the first-3-letters rule gets wrong. */
const CODE_OVERRIDES: Record<string, string> = {
  'United States': 'EUA',
  USA: 'EUA',
  'South Korea': 'COR',
  'Costa Rica': 'CRC',
  'South Africa': 'AFS',
  'Ivory Coast': 'CIV',
  Wales: 'GAL',
  'New Zealand': 'NZL',
  'Saudi Arabia': 'KSA',
};

/** Short 3-letter display code (pt-BR style: Alemanha → ALE, Suíça → SUI). */
export function teamCode(en: string): string {
  const override = CODE_OVERRIDES[en];
  if (override) return override;
  return teamName(en)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 3)
    .toUpperCase();
}
