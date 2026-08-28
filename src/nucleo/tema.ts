/**
 * Tokens visuais — a mesma marca do site.
 *
 * Convertidos do `:root` de `src/index.css`, onde estão em HSL. Aqui ficam em hexadecimal
 * porque o React Native não entende `hsl()` em todos os lugares (sombras e gradientes
 * reclamam), e porque converter uma vez é melhor que converter em cada componente.
 *
 * Não está no contrato verificado: o site consome via Tailwind, o app via objeto. São
 * representações diferentes do mesmo valor — e a divergência está registrada.
 */
export const cores = {
  fundo: '#F5F6F8',
  fundoCartao: '#FFFFFF',
  texto: '#0F172A',
  textoSuave: '#6B7280',

  primaria: '#2E4BD8',
  primariaTexto: '#FFFFFF',
  destaque: '#5B3FE0',

  borda: '#DCDFE5',
  secundaria: '#E8EAEF',

  perigo: '#DC2626',
  aviso: '#D97706',
  sucesso: '#059669',

  // Estados de turno, espelhando a grade do site.
  turnoVazio: '#FFFFFF',
  turnoPreenchido: '#ECFDF5',
  turnoPublicado: '#F0F9FF',
  turnoBloqueado: '#F1F5F9',
} as const;

export const espacamento = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const tipografia = {
  titulo: { fontSize: 24, fontWeight: '700' as const },
  subtitulo: { fontSize: 18, fontWeight: '600' as const },
  corpo: { fontSize: 15, fontWeight: '400' as const },
  legenda: { fontSize: 13, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '500' as const },
} as const;

export const raio = { sm: 6, md: 10, lg: 16 } as const;

/** Área mínima de toque recomendada pelas duas plataformas. Não encolher. */
export const TOQUE_MINIMO = 44;
