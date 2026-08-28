import type { ConfirmationWarningItem, RequestWarning } from '@/contract/requestTypes';

export type WarningLike = RequestWarning | ConfirmationWarningItem;

export interface WarningPresentation {
  title: string;
  description: string;
  consequence?: string;
  details: Array<{ label: string; value: string }>;
}

function normalizeCode(warning: WarningLike): string {
  return String(warning.code || '').trim().toUpperCase();
}

function baseCode(warning: WarningLike): string {
  return normalizeCode(warning).replace(/_FORCED$/, '');
}

function contextValue(warning: WarningLike, key: string): unknown {
  // Dupla conversao de proposito: ConfirmationWarningItem nao tem assinatura de indice,
  // e sob `strict` a conversao direta e recusada. Este arquivo e compartilhado com o
  // aplicativo, que compila em modo estrito — ver scripts/check-contract.mjs.
  const direct = (warning as unknown as Record<string, unknown>)[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  return warning.context?.[key];
}

function stringValue(warning: WarningLike, key: string): string {
  const value = contextValue(warning, key);
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function sentenceCase(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function formatDateOnly(value: unknown): string {
  if (!value) return '';

  if (typeof value === 'string') {
    const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

// PONTE DE COMPATIBILIDADE (não remover enquanto houver warnings legados persistidos):
// avisos antigos (auditoria, histórico, snapshots em warnings_before/after) ainda trazem a
// data crua na `message` — Date.toString() (GMT) ou ISO — sem os campos estruturados
// start_date/end_date/context. Telas de histórico dependem deste fallback para exibir a data
// desses registros. Só pode sair quando não existirem mais warnings sem os campos
// estruturados. Coberto pelo teste "extrai datas de mensagem legada com GMT como fallback".
function extractDateRangeFromMessage(message: string): { start: string; end: string } | null {
  const gmtMatches = message.match(/[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[+-]\d{4}(?:\s+\([^)]+\))?/g);
  if (gmtMatches && gmtMatches.length >= 2) {
    return {
      start: formatDateOnly(gmtMatches[0]),
      end: formatDateOnly(gmtMatches[1]),
    };
  }

  const isoMatches = message.match(/\d{4}-\d{2}-\d{2}(?:T[^\s)]+)?/g);
  if (isoMatches && isoMatches.length >= 2) {
    return {
      start: formatDateOnly(isoMatches[0]),
      end: formatDateOnly(isoMatches[1]),
    };
  }

  return null;
}

function formatDateRange(warning: WarningLike): string {
  const start = formatDateOnly(contextValue(warning, 'start_date'));
  const end = formatDateOnly(contextValue(warning, 'end_date'));
  if (start && end) return `${start} até ${end}`;
  if (start) return `a partir de ${start}`;
  if (end) return `até ${end}`;

  const extracted = extractDateRangeFromMessage(warning.message || '');
  if (extracted?.start && extracted?.end) return `${extracted.start} até ${extracted.end}`;
  return '';
}

function extractRoleMismatch(message: string): { expected: string; actual: string } | null {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/cargo necess[aá]rio\s+([^;.,]+)[;,.]\s*funcion[aá]rio selecionado (?:e|é)\s+([^.;]+)/i);
  if (!match) return null;
  return {
    expected: match[1].trim(),
    actual: match[2].trim(),
  };
}

// Remove o prefixo técnico (ex.: "...não atendida:", "...qualificação:") deixando só o texto da regra.
function stripRulePrefix(message: string): string {
  return String(message || '')
    .replace(/^.*?(?:n[aã]o atendid[ao]|qualifica[çc][ãa]o|divergente)\s*:\s*/i, '')
    .trim();
}

// Suaviza mensagens cruas (fallback p/ códigos desconhecidos): troca jargão por linguagem humana.
function cleanTechnicalMessage(message: string): string {
  const text = String(message || '').trim();
  if (!text) return 'Revise este alerta antes de continuar.';

  return text
    .replace(/\bHARD\b/g, 'obrigatória')
    .replace(/\bSOFT\b/g, 'preferencial')
    .replace(/Regra obrigat[óo]ria( de qualifica[çc][ãa]o)? n[ãa]o atendida:/gi, 'Critério obrigatório não atendido:')
    .replace(/Regra preferencial( de qualifica[çc][ãa]o)? n[ãa]o atendida:/gi, 'Preferência não atendida:')
    .replace(/Prefer[êe]ncia de qualifica[çc][ãa]o n[ãa]o atendida:/gi, 'Preferência não atendida:')
    .replace(/Desvio de fun[çc][ãa]o/gi, 'Cargo diferente do necessário')
    .replace(/\s+/g, ' ')
    .trim();
}

function detail(label: string, value: string | null | undefined): { label: string; value: string } | null {
  const clean = String(value || '').trim();
  return clean ? { label, value: clean } : null;
}

export function presentWarning(warning: WarningLike): WarningPresentation {
  const code = baseCode(warning);
  const rawMessage = warning.message || '';
  const forced = normalizeCode(warning).endsWith('_FORCED');

  if (code === 'ABSENT') {
    const period = formatDateRange(warning);
    const reason = stringValue(warning, 'reason');
    const memberName = stringValue(warning, 'member_name');
    const details = [
      detail('Período', period),
      detail('Motivo', reason),
    ].filter(Boolean) as Array<{ label: string; value: string }>;

    return {
      title: forced ? 'Alocação forçada durante afastamento' : 'Funcionário em afastamento',
      description: memberName
        ? `${memberName} está afastado${period ? ` de ${period}` : ' neste período'}.`
        : (period ? `Afastado de ${period}.` : 'Existe um afastamento ativo neste período.'),
      consequence: forced
        ? 'Este turno foi mantido mesmo com indisponibilidade registrada.'
        : 'Forçar a alocação manterá o funcionário escalado mesmo indisponível.',
      details,
    };
  }

  if (code === 'ROLE_MISMATCH_HARD' || code === 'ROLE_MISMATCH') {
    const parsed = extractRoleMismatch(rawMessage);
    const expected = stringValue(warning, 'expected_role') || parsed?.expected || '';
    const actual = stringValue(warning, 'actual_role') || parsed?.actual || '';
    const details = [
      detail('Vaga', expected),
      detail('Selecionado', actual),
    ].filter(Boolean) as Array<{ label: string; value: string }>;

    return {
      title: 'Cargo diferente do necessário',
      description: expected && actual
        ? `A vaga pede ${expected}, mas o funcionário selecionado está como ${actual}.`
        : 'O cargo do funcionário selecionado não corresponde ao cargo pedido para este turno.',
      consequence: 'Confirme apenas se essa pessoa pode cobrir esta função com segurança.',
      details,
    };
  }

  if (code === 'QUALIFICATION_HARD') {
    return {
      title: 'Critério obrigatório não atendido',
      description: stripRulePrefix(rawMessage) || 'Esta cobertura exige um critério que o funcionário selecionado não cumpre.',
      consequence: 'Forçar a alocação ignora um critério obrigatório desta cobertura.',
      details: [],
    };
  }

  if (code === 'QUALIFICATION_SOFT') {
    return {
      title: 'Preferência não atendida',
      description: stripRulePrefix(rawMessage) || 'O funcionário selecionado foge de uma preferência definida para esta cobertura.',
      consequence: 'A alocação é permitida, mas foge da preferência definida.',
      details: [],
    };
  }

  if (code.includes('HOLIDAY')) {
    return {
      title: 'Turno em folga ou feriado',
      description: cleanTechnicalMessage(rawMessage),
      consequence: 'Revise antes de confirmar para evitar escala em dia bloqueado.',
      details: [],
    };
  }

  if (code.includes('LOCKED_SHIFT')) {
    return {
      title: 'Turno bloqueado manualmente',
      description: cleanTechnicalMessage(rawMessage),
      consequence: 'A confirmação altera um turno que estava protegido contra mudanças automáticas.',
      details: [],
    };
  }

  if (warning.overlap_minutes !== undefined) {
    return {
      title: 'Sobreposição de horário',
      description: cleanTechnicalMessage(rawMessage),
      consequence: 'O funcionário pode ficar alocado em horários conflitantes.',
      details: [],
    };
  }

  if (warning.rest_min !== undefined || warning.required_rest_min !== undefined) {
    return {
      title: 'Descanso entre turnos abaixo do ideal',
      description: cleanTechnicalMessage(rawMessage),
      consequence: 'Revise se a carga e o descanso continuam seguros.',
      details: [],
    };
  }

  return {
    title: sentenceCase(warning.title || 'Alerta de escala'),
    description: cleanTechnicalMessage(rawMessage),
    details: [],
  };
}

export function countCriticalWarnings(warnings: WarningLike[]): number {
  return warnings.filter((warning) => warning.type === 'CRITICAL').length;
}

export function buildAssignmentWarningSummary(warnings: WarningLike[]): string {
  const count = warnings.length;
  if (count === 0) return 'A operação apresentou alertas. Revise antes de continuar.';

  const criticalCount = countCriticalWarnings(warnings);
  const noun = count === 1 ? 'ponto' : 'pontos';
  if (criticalCount > 0) {
    return `Encontramos ${count} ${noun} que podem impedir esta alocação. Revise antes de forçar a mudança.`;
  }
  return `Encontramos ${count} ${noun} de atenção nesta alocação. Revise antes de continuar.`;
}
