/**
 * A aritmética da escala do gestor.
 *
 * Tudo aqui é puro e tem teste, porque é onde montar escala erra: um dia deslocado por fuso
 * coloca o turno na data errada, um intervalo grande demais toma 400 do servidor, e um
 * horário mal construído cria um turno que começa três horas fora do que o gestor viu.
 *
 * Nenhuma dessas falhas aparece como erro na tela. Todas aparecem como escala errada.
 */
import { toDateKeyInTimezone } from '@/contract/dateInTimezone';

/**
 * O teto do backend: `listQuerySchema` recusa intervalos acima de 31 dias, para o front não
 * pedir o ano inteiro e travar a base. Pedir 32 devolve 400, não uma lista cortada.
 */
export const MAXIMO_DE_DIAS = 31;

// ── Datas como texto ────────────────────────────────────────────────────────

/**
 * Aritmética de dia sobre "AAAA-MM-DD", sem passar por `Date` local.
 *
 * `new Date('2026-09-01')` é meia-noite UTC; somar um dia e ler `getDate()` devolve o dia
 * anterior para quem está a oeste de Greenwich. Usar UTC nos dois lados elimina o problema:
 * o texto entra e sai como texto, e o fuso nunca participa.
 */
export function somarDias(dia: string, quantidade: number): string {
  const [ano, mes, d] = dia.split('-').map(Number);
  if (!ano || !mes || !d) return dia;

  const t = Date.UTC(ano, mes - 1, d) + quantidade * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Quantos dias separam dois "AAAA-MM-DD" (fim - início). Negativo se estiverem invertidos. */
export function diferencaEmDias(inicio: string, fim: string): number {
  const paraUtc = (dia: string) => {
    const [ano, mes, d] = dia.split('-').map(Number);
    return Date.UTC(ano, mes - 1, d);
  };
  return Math.round((paraUtc(fim) - paraUtc(inicio)) / 86_400_000);
}

/** Hoje, no fuso da organização — não no do aparelho. */
export function hojeNaOrganizacao(fuso: string, agora: Date = new Date()): string {
  return toDateKeyInTimezone(agora, fuso);
}

// ── Intervalos ──────────────────────────────────────────────────────────────

export type Intervalo = { inicio: string; fim: string };

/**
 * A semana que contém `dia`, de segunda a domingo.
 *
 * Segunda como primeiro dia porque é assim que se lê escala de trabalho no Brasil — e é o
 * que a grade do site usa. Domingo primeiro deslocaria a semana inteira em relação ao que o
 * gestor já conhece.
 */
export function semanaDe(dia: string): Intervalo {
  const [ano, mes, d] = dia.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, d));

  // getUTCDay: 0 é domingo. Queremos a distância até a segunda anterior.
  const diaDaSemana = data.getUTCDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;

  const inicio = somarDias(dia, -recuo);
  return { inicio, fim: somarDias(inicio, 6) };
}

/**
 * Limita um intervalo ao teto do servidor.
 *
 * Chamar com 60 dias não devolve 60 dias truncados no cliente: devolve 400, e a tela fica
 * vazia sem explicação. Cortar aqui é o que mantém o pedido sempre válido.
 */
export function limitarIntervalo(intervalo: Intervalo): Intervalo {
  const dias = diferencaEmDias(intervalo.inicio, intervalo.fim);
  if (dias < 0) return { inicio: intervalo.inicio, fim: intervalo.inicio };
  if (dias + 1 > MAXIMO_DE_DIAS) {
    return { inicio: intervalo.inicio, fim: somarDias(intervalo.inicio, MAXIMO_DE_DIAS - 1) };
  }
  return intervalo;
}

// ── Instante a partir de dia e hora ─────────────────────────────────────────

/**
 * Que horas o relógio de `fuso` marca neste instante, menos o instante em si.
 *
 * É o deslocamento do fuso naquele momento, em milissegundos — calculado formatando em vez
 * de tabelar, porque a tabela envelhece e o `Intl` não.
 */
function deslocamentoMs(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);

  const ler = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? '0');

  // Algumas versões do ICU devolvem "24" para meia-noite com hour12 falso.
  const comoSeFosseUtc = Date.UTC(
    ler('year'), ler('month') - 1, ler('day'),
    ler('hour') % 24, ler('minute'), ler('second'),
  );

  return comoSeFosseUtc - instante.getTime();
}

/**
 * O instante em que o relógio da organização marca `dia` às `hora`.
 *
 * O caminho ingênuo — `new Date(\`${dia}T${hora}\`)` — usa o fuso do APARELHO. Um gestor
 * viajando, ou com o celular mal configurado, criaria turnos horas fora do que viu na tela,
 * e a diferença só apareceria para quem fosse trabalhar.
 *
 * O método é converter e corrigir: supõe-se que o relógio desejado seja UTC, mede-se o quanto
 * o fuso desloca naquele ponto, e ajusta-se. A segunda passada existe para a virada de
 * horário de verão, em que o deslocamento medido antes do ajuste é o do lado errado da
 * mudança. O Brasil não usa mais horário de verão, mas o fuso da organização é configurável.
 *
 * Devolve `null` para entrada inválida — nunca uma data errada, que é pior.
 */
export function instanteNaOrganizacao(dia: string, hora: string, fuso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(hora || '')) return null;

  const [ano, mes, d] = dia.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);

  if (mes < 1 || mes > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null;

  const relogioDesejado = Date.UTC(ano, mes - 1, d, h, min);

  let instante = relogioDesejado - deslocamentoMs(new Date(relogioDesejado), fuso);
  instante = relogioDesejado - deslocamentoMs(new Date(instante), fuso);

  const resultado = new Date(instante);
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

// ── Resumo do dia ───────────────────────────────────────────────────────────

export type TurnoDaEscala = {
  id: string;
  start_timestamp: string;
  end_timestamp: string;
  status?: string | null;
  is_locked_by_admin?: boolean;
  member?: { id?: string | null; name?: string | null } | null;
  member_id?: string | null;
  location?: { id?: string | null; name?: string | null } | null;
  shift_model?: { id?: string | null; name?: string | null } | null;
  required_role?: string | null;
  warnings?: Array<{ code?: string; severity?: string }> | null;
};

/** Um turno sem ninguém é uma VAGA — o que o gestor está procurando na tela. */
export function estaVago(turno: TurnoDaEscala): boolean {
  return !turno?.member?.id && !turno?.member_id;
}

export type ResumoDoDia = {
  total: number;
  preenchidos: number;
  vagas: number;
  comAviso: number;
};

/**
 * O resumo que vai no cabeçalho de cada dia.
 *
 * Existe para o gestor achar o buraco sem ler a lista inteira. No celular, rolar procurando
 * uma vaga entre trinta turnos é o oposto de montar escala rápido.
 */
export function resumoDoDia(turnos: TurnoDaEscala[]): ResumoDoDia {
  let vagas = 0;
  let comAviso = 0;

  for (const turno of turnos || []) {
    if (estaVago(turno)) vagas += 1;
    if ((turno?.warnings?.length ?? 0) > 0) comAviso += 1;
  }

  const total = (turnos || []).length;
  return { total, preenchidos: total - vagas, vagas, comAviso };
}

// ── Turno avulso ────────────────────────────────────────────────────────────

export type RascunhoDeAvulso = {
  dia: string;
  hora: string;
  duracaoMinutos: number;
  localId: string | null;
  modeloId: string | null;
};

export function validarTurnoAvulso(rascunho: RascunhoDeAvulso): string[] {
  const erros: string[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rascunho.dia || '')) {
    erros.push('Escolha o dia no formato AAAA-MM-DD.');
  }
  if (!/^\d{2}:\d{2}$/.test(rascunho.hora || '')) {
    erros.push('Informe a hora de início no formato HH:MM.');
  }
  if (!rascunho.localId) erros.push('Escolha o local.');
  if (!rascunho.modeloId) erros.push('Escolha o modelo de turno.');

  if (!Number.isFinite(rascunho.duracaoMinutos) || rascunho.duracaoMinutos <= 0) {
    // `createAdhocSchema` exige término depois do início; duração zero produziria um turno
    // que o servidor recusa com uma mensagem que não explica nada ao gestor.
    erros.push('O modelo escolhido não tem duração definida.');
  }

  return erros;
}

/**
 * Monta o corpo de `POST /shifts` a partir do que o gestor escolheu.
 *
 * O schema é `.strict()`: um campo a mais e a requisição inteira é recusada. Por isso
 * `member_id` só entra quando existe, em vez de ir como `null`.
 */
export function corpoDoTurnoAvulso(
  rascunho: RascunhoDeAvulso,
  fuso: string,
  membroId?: string | null,
): {
  location_id: string;
  shift_model_id: string;
  start_timestamp: string;
  end_timestamp: string;
  member_id?: string;
} | null {
  if (validarTurnoAvulso(rascunho).length > 0) return null;

  const inicio = instanteNaOrganizacao(rascunho.dia, rascunho.hora, fuso);
  if (!inicio) return null;

  const fim = new Date(inicio.getTime() + rascunho.duracaoMinutos * 60_000);

  const corpo = {
    location_id: rascunho.localId as string,
    shift_model_id: rascunho.modeloId as string,
    start_timestamp: inicio.toISOString(),
    end_timestamp: fim.toISOString(),
  };

  return membroId ? { ...corpo, member_id: membroId } : corpo;
}
