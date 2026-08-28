/**
 * Funções puras da tela de Regras — local, horário e cobertura.
 *
 * É aqui que o gestor define o que o motor vai gerar: quantas pessoas, de qual cargo, em
 * qual local, em quais dias e por quanto tempo. Um erro nesta tela não aparece como erro —
 * aparece como escala errada, dias depois, sem ninguém saber de onde veio.
 *
 * Extraídas de RegrasPage.tsx sem mudança de comportamento, para poderem ser exercitadas
 * sem montar a página inteira (2.081 linhas, três abas, seis diálogos).
 */
import { format as fnsFormat } from 'date-fns';

export const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const ANY_ROLE_VALUE = 'ANY';
export const ANY_ROLE_LABEL = 'Qualquer cargo';

/** Entidade com vigência — o mínimo que as funções de data precisam enxergar. */
export type ComVigencia = {
  is_active?: boolean;
  pending_deletion?: boolean;
  pending_deletion_effective_date?: string | null;
  end_date?: string | null;
};

/** Modelo de turno como as funções de disponibilidade precisam vê-lo. */
export type ModeloDeTurno = {
  pending_version?: unknown;
  superseded_by_id?: string | null;
  is_ended?: boolean;
  is_active?: boolean;
};

export function formatRoleLabel(role?: string | null): string {
  const normalized = String(role || '').trim().toUpperCase();
  if (normalized === ANY_ROLE_VALUE) return ANY_ROLE_LABEL;
  return String(role || '—');
}

export function todayStr(): string {
  return fnsFormat(new Date(), 'yyyy-MM-dd');
}

export function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return fnsFormat(d, 'yyyy-MM-dd');
}

export function formatDays(days: number[]): string {
  if (!days || days.length === 0) return '—';
  const sorted = [...days].sort();
  if (sorted.length === 7) return 'Toda a semana';
  return sorted.map((d) => DAYS[d]).join(', ');
}

/**
 * Converte texto de data em Date sem cair na armadilha do fuso.
 *
 * `new Date('2026-03-16')` é meia-noite UTC — que no Brasil ainda é dia 15. Uma cobertura
 * marcada para começar dia 16 apareceria como 15 na tela e seria comparada como 15 nas
 * regras de vigência. Por isso a data-só é ancorada ao MEIO-DIA local: nenhum fuso do mundo
 * empurra meio-dia para o dia anterior ou seguinte.
 */
export function safeParseDate(raw: string): Date | null {
  if (!raw) return null;

  const normalized = raw.includes('T') ? raw.slice(0, 10) : raw;
  const parts = normalized.split('-').map(Number);

  let d: Date;
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    const [ano, mes, dia] = parts;
    d = new Date(ano, mes - 1, dia, 12, 0, 0, 0);

    // O construtor de Date TRANSBORDA em silêncio: mês 99 e dia 99 viram uma data real
    // oito anos à frente, em vez de erro. Uma vigência assim apareceria como "Agendada para
    // 07/06/2034" — plausível, errada, e sem nada indicando que o valor original era lixo.
    // Só aceitamos a data se ela devolver exatamente o que foi escrito.
    const voltouIgual = d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
    if (!voltouIgual) return null;
  } else {
    d = new Date(raw);
  }

  if (isNaN(d.getTime())) return null;
  return d;
}

/** Data para leitura. Texto ilegível volta como veio, em vez de virar "Invalid Date". */
export function formatDateDisplay(raw: string): string {
  const d = safeParseDate(raw);
  if (!d) return raw;
  return fnsFormat(d, 'dd/MM/yyyy');
}

/** A vigência da regra em uma frase: perpétua, faixa fechada, ou aberta de um dos lados. */
export function formatDuration(item: { start_date?: string | null; end_date?: string | null }): string {
  const sd = item.start_date;
  const ed = item.end_date;
  if (!sd && !ed) return 'Perpétuo';
  if (sd && ed) return `${formatDateDisplay(sd)} — ${formatDateDisplay(ed)}`;
  if (sd) return `A partir de ${formatDateDisplay(sd)}`;
  return `Até ${formatDateDisplay(ed as string)}`;
}

/**
 * A regra está viva hoje mas já tem data para morrer?
 *
 * Encerramento é agendado, não imediato: o gestor marca a data e a regra continua gerando
 * escala até lá. A tela precisa mostrar isso — "Encerrando em 30/09" é informação diferente
 * de "Inativa", e confundir as duas faz o gestor achar que já parou de gerar.
 */
export function isPendingDeletion(entity: ComVigencia): boolean {
  if (entity.pending_deletion === true) return true;
  if (entity.is_active !== true) return false;
  const effectiveRaw = entity.pending_deletion_effective_date || entity.end_date;
  if (!effectiveRaw) return false;
  const effective = safeParseDate(effectiveRaw);
  if (!effective) return false;
  return effective > new Date();
}

export function getPendingEffectiveDate(entity: ComVigencia): string | null {
  return entity.pending_deletion_effective_date || entity.end_date || null;
}

export function toApiDate(d: Date | undefined): string {
  if (!d) return '';
  return fnsFormat(d, 'yyyy-MM-dd');
}

/**
 * "08:30" vira 510 minutos.
 *
 * Texto ilegível vira 0 de propósito: o campo é obrigatório e validado antes do envio, e um
 * NaN silencioso viraria duração nula no motor — turno sem fim.
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/** 510 minutos vira "08:30" — o formato do campo de edição. */
export function minutesToTime(totalMins: number | null | undefined): string {
  if (totalMins == null || isNaN(totalMins)) return '';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** O mesmo número para leitura: "45 minutos", "08:30h", "0h". */
export function formatMinutesPretty(totalMins: number | null | undefined): string {
  if (totalMins == null || isNaN(totalMins)) return '—';
  if (totalMins === 0) return '0h';

  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;

  if (h === 0) return `${m} minutos`;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}h`;
}

/** O intervalo do turno: duração, e o horário fixo quando ele existe. */
export function formatBreak(s: {
  has_break?: boolean;
  break_duration_minutes?: number | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
}): string {
  if (!s.has_break) return '—';
  const durationText = formatMinutesPretty(s.break_duration_minutes);
  if (s.break_start_time && s.break_end_time && s.break_start_time.trim() !== '' && s.break_end_time.trim() !== '') {
    return `${durationText} - ${s.break_start_time} às ${s.break_end_time}`;
  }
  if (durationText === '—') return '—';
  return durationText;
}

/**
 * O backend recusou por falta de data efetiva?
 *
 * Não é erro de preenchimento: é o servidor dizendo que aquele horário já está em uso e a
 * mudança precisa virar uma nova versão com data para valer. A tela usa isso para abrir o
 * diálogo de versionamento em vez de mostrar a mensagem crua do servidor.
 */
export function isEffectiveDateRequiredError(err: unknown): boolean {
  const apiErr = err as Error & { status?: number };
  const message = String(apiErr?.message || '').toLowerCase();
  return apiErr?.status === 400
    && message.includes('effective_date')
    && (message.includes('obrig') || message.includes('data efetiva'));
}

/**
 * O horário pode ser apontado por uma cobertura nova?
 *
 * Não pode se estiver encerrado, inativo, ou se já tiver uma nova versão agendada — nos três
 * casos a cobertura nasceria sem conseguir gerar escala.
 */
export function isShiftModelUnavailableForRequirement(model?: ModeloDeTurno | null): boolean {
  if (!model) return false;
  return Boolean(
    model.pending_version
    || model.superseded_by_id
    || model.is_ended
    || model.is_active === false
  );
}

/** Por que o horário não está disponível, na linguagem do gestor. */
export function getShiftModelUnavailableLabel(model: ModeloDeTurno): string | null {
  if (model.pending_version || model.superseded_by_id) return 'novo horário agendado';
  if (model.is_ended || model.is_active === false) return 'horário encerrado';
  return null;
}

/** Cobertura com vigência vencida que ainda não foi marcada como inativa. */
export function isRequirementDateEnded(r: {
  is_active?: boolean;
  superseded_by_id?: string | null;
  end_date?: string | null;
}): boolean {
  return Boolean(r.is_active !== false && !r.superseded_by_id && r.end_date && new Date(r.end_date) <= new Date());
}

/** Substituída por nova versão, ou logicamente encerrada por data: não se edita mais. */
export function isRequirementReadOnly(r: {
  is_active?: boolean;
  superseded_by_id?: string | null;
  end_date?: string | null;
}): boolean {
  return Boolean(r.superseded_by_id) || isRequirementDateEnded(r);
}

export type SituacaoCobertura = { label: string; variant: 'default' | 'secondary' | 'outline' };

export type CoberturaParaSituacao = ComVigencia & {
  superseded_by_id?: string | null;
  start_date?: string | null;
  shift_model?: { is_ended?: boolean; is_active?: boolean } | null;
};

/**
 * A situação da cobertura como o gestor precisa ler.
 *
 * A ORDEM das checagens é a regra, não detalhe: uma cobertura pode ser substituída E ter
 * data de encerramento E apontar para um horário morto ao mesmo tempo. O rótulo que aparece
 * tem que ser o do motivo mais forte — o que explica por que ela não está gerando escala.
 *
 * "Sem horário ativo" é o caso mais fácil de perder e o mais caro: a cobertura está ativa,
 * dentro da vigência, e mesmo assim não gera nada, porque o horário que ela aponta foi
 * encerrado. Mostrá-la como "Ativa" faria o gestor esperar uma escala que nunca vem.
 */
export function getRequirementSituacao(r: CoberturaParaSituacao): SituacaoCobertura {
  if (r.superseded_by_id) return { label: 'Substituída', variant: 'outline' };

  if (isPendingDeletion(r)) {
    const pendingDate = getPendingEffectiveDate(r);
    return {
      label: pendingDate ? `Encerrando em ${formatDateDisplay(pendingDate)}` : 'Encerramento agendado',
      variant: 'outline',
    };
  }

  if (r.is_active === false) return { label: 'Inativa', variant: 'secondary' };

  if (isRequirementDateEnded(r)) return { label: 'Encerrada', variant: 'secondary' };

  if (r.shift_model?.is_ended || r.shift_model?.is_active === false) {
    return { label: 'Sem horário ativo', variant: 'secondary' };
  }

  if (r.start_date && new Date(r.start_date) > new Date()) {
    return { label: `Agendada para ${formatDateDisplay(r.start_date)}`, variant: 'outline' };
  }

  return { label: 'Ativa', variant: 'default' };
}

export type FormularioCobertura = {
  role: string;
  quantity: string;
  location_id: string;
  shift_model_id: string;
  days_of_week: number[];
  start_date: string;
  end_date: string;
};

/**
 * Retrato do formulário, para saber se algo mudou desde que ele abriu.
 *
 * Os dias da semana são ordenados antes de virar texto: marcar segunda depois de sexta não
 * é uma mudança, e sem a ordenação o botão de salvar acordaria sozinho.
 */
export function buildFormSnapshot(form: FormularioCobertura, qualRules: unknown[]): string {
  return JSON.stringify({
    role: form.role,
    quantity: form.quantity,
    location_id: form.location_id,
    shift_model_id: form.shift_model_id,
    days_of_week: [...form.days_of_week].sort(),
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    qualification_rules: qualRules,
  });
}

export type FormularioHorario = {
  name: string;
  start_time: string;
  duration_time: string;
  rest_time: string;
  has_break: boolean;
  break_duration_time: string;
  break_start_time: string;
  break_end_time: string;
};

export type CorpoHorario = {
  name: string;
  start_time: string;
  duration_minutes: number;
  rest_minutes_after: number;
  has_break: boolean;
  break_duration_minutes: number | null;
  break_start_time: string | null;
  break_end_time: string | null;
};

/**
 * O horário como o backend o recebe.
 *
 * Sem intervalo, os três campos vão explicitamente como null em vez de ficarem de fora: numa
 * edição, campo ausente deixaria o intervalo antigo gravado, e o motor continuaria
 * descontando um tempo que o gestor acabou de remover.
 */
export function buildModelBody(form: FormularioHorario): CorpoHorario {
  const body: CorpoHorario = {
    name: form.name,
    start_time: form.start_time,
    duration_minutes: timeToMinutes(form.duration_time),
    rest_minutes_after: timeToMinutes(form.rest_time),
    has_break: form.has_break,
    break_duration_minutes: null,
    break_start_time: null,
    break_end_time: null,
  };

  if (form.has_break) {
    body.break_duration_minutes = timeToMinutes(form.break_duration_time);
    body.break_start_time = form.break_start_time || null;
    body.break_end_time = form.break_end_time || null;
  }

  return body;
}

/**
 * A edição mexe em algo que muda a escala já gerada?
 *
 * Renomear um horário é cosmético. Mudar hora de início, duração, descanso ou intervalo
 * altera todo turno que já existe a partir dele — e por isso exige virar uma nova versão com
 * data efetiva, em vez de reescrever o passado.
 */
export function hasSensitiveChange(
  body: CorpoHorario,
  item: {
    start_time?: string;
    duration_minutes?: number | null;
    duration_hours?: number | null;
    rest_minutes_after?: number | null;
    has_break?: boolean;
    break_duration_minutes?: number | null;
    break_start_time?: string | null;
    break_end_time?: string | null;
  }
): boolean {
  const itemDuration = item.duration_minutes ?? (item.duration_hours ? item.duration_hours * 60 : null);
  return body.start_time !== item.start_time
    || body.duration_minutes !== itemDuration
    || body.rest_minutes_after !== item.rest_minutes_after
    || body.has_break !== Boolean(item.has_break)
    || (body.break_duration_minutes ?? null) !== (item.break_duration_minutes ?? null)
    || (body.break_start_time ?? null) !== (item.break_start_time ?? null)
    || (body.break_end_time ?? null) !== (item.break_end_time ?? null);
}
