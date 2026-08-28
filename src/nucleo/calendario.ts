/**
 * A parte difícil de exportar a escala para o calendário do celular não é criar o evento.
 * É mantê-lo certo depois.
 *
 * O turno muda de horário, o gestor troca o local, a pessoa sai da escala — e o evento
 * continua lá, mentindo, num aplicativo que não é o nosso. Um calendário errado é pior que
 * calendário nenhum: a pessoa confia nele e aparece na hora errada.
 *
 * Este módulo é a reconciliação, e é puro de propósito: tudo que decide o que criar,
 * atualizar e apagar tem teste, e o que fala com o sistema (`calendario-do-sistema.ts`) fica
 * sendo uma casca fina.
 */
import { toDateKeyInTimezone } from '@/contract/dateInTimezone';

export type TurnoParaCalendario = {
  id: string;
  start_timestamp: string;
  end_timestamp: string;
  location?: { name?: string | null } | null;
  shift_model?: { name?: string | null } | null;
};

/** O que foi gravado no aparelho sobre um turno já exportado. */
export type EventoConhecido = {
  eventoId: string;
  /** O que o evento continha da última vez. Muda quando o turno muda. */
  assinatura: string;
  /** O dia do turno, para a reconciliação saber se ele está dentro da janela. */
  dia: string;
};

export type Mapeamento = Record<string, EventoConhecido>;

export type Janela = { inicio: string; fim: string };

/**
 * O que define um evento diferente do que está gravado.
 *
 * Só o que aparece para quem lê o calendário: horário, local e nome do turno. O `status` do
 * turno não entra — publicar uma escala que já estava correta reescreveria todos os eventos
 * do mês por nada, e cada reescrita é uma notificação do calendário no celular da pessoa.
 */
export function assinaturaDoTurno(turno: TurnoParaCalendario): string {
  return [
    turno.start_timestamp,
    turno.end_timestamp,
    turno.location?.name ?? '',
    turno.shift_model?.name ?? '',
  ].join('|');
}

export function tituloDoEvento(turno: TurnoParaCalendario): string {
  const local = turno.location?.name?.trim();
  return local ? `Turno · ${local}` : 'Turno';
}

export function detalhesDoEvento(turno: TurnoParaCalendario): string {
  const partes = ['Criado pela Escala Fácil.'];
  if (turno.shift_model?.name?.trim()) partes.unshift(turno.shift_model.name.trim());
  return partes.join('\n');
}

export type PlanoDeSincronizacao = {
  criar: TurnoParaCalendario[];
  atualizar: Array<{ turno: TurnoParaCalendario; eventoId: string }>;
  remover: Array<{ turnoId: string; eventoId: string }>;
};

/**
 * O que precisa mudar no calendário para ele refletir a escala.
 *
 * **A janela é a parte que se erra.** O app sincroniza um período — as próximas semanas, não
 * a vida inteira. Reconciliar a lista desse período contra o mapeamento INTEIRO faria o
 * primeiro sync apagar todo evento fora da janela: o mês passado, o mês que vem, tudo que
 * simplesmente não foi consultado desta vez.
 *
 * Some sem erro, e a pessoa só descobre quando procura o turno e ele não está lá.
 *
 * Por isso a remoção considera apenas o que está gravado DENTRO da janela: fora dela, a
 * ausência não significa nada.
 */
export function planejarSincronizacao(
  turnos: TurnoParaCalendario[],
  mapeamento: Mapeamento,
  janela: Janela,
): PlanoDeSincronizacao {
  const plano: PlanoDeSincronizacao = { criar: [], atualizar: [], remover: [] };
  const vistos = new Set<string>();

  for (const turno of turnos || []) {
    if (!turno?.id) continue;
    vistos.add(turno.id);

    const conhecido = mapeamento[turno.id];
    if (!conhecido) {
      plano.criar.push(turno);
      continue;
    }

    // Igual ao que já está no calendário: não tocar. Reescrever por nada gera notificação
    // no celular de quem só queria ver a escala.
    if (conhecido.assinatura !== assinaturaDoTurno(turno)) {
      plano.atualizar.push({ turno, eventoId: conhecido.eventoId });
    }
  }

  for (const [turnoId, conhecido] of Object.entries(mapeamento)) {
    if (vistos.has(turnoId)) continue;
    // Fora da janela consultada, "não veio na lista" não quer dizer "não existe mais".
    if (conhecido.dia < janela.inicio || conhecido.dia > janela.fim) continue;
    plano.remover.push({ turnoId, eventoId: conhecido.eventoId });
  }

  return plano;
}

/** O mapeamento depois do plano ter sido aplicado com sucesso. */
export function aplicarAoMapeamento(
  mapeamento: Mapeamento,
  aplicados: {
    criados: Array<{ turno: TurnoParaCalendario; eventoId: string }>;
    atualizados: Array<{ turno: TurnoParaCalendario; eventoId: string }>;
    removidos: string[];
  },
  fuso: string,
): Mapeamento {
  const novo: Mapeamento = { ...mapeamento };

  for (const { turno, eventoId } of [...aplicados.criados, ...aplicados.atualizados]) {
    novo[turno.id] = {
      eventoId,
      assinatura: assinaturaDoTurno(turno),
      dia: toDateKeyInTimezone(turno.start_timestamp, fuso),
    };
  }

  for (const turnoId of aplicados.removidos) delete novo[turnoId];

  return novo;
}

/**
 * O mapeamento lido do disco, saneado.
 *
 * O que está gravado no aparelho sobreviveu a versões anteriores do app e a tudo que o
 * usuário fez com o calendário dele. Confiar cegamente nesse formato é como o sync passa a
 * quebrar depois de uma atualização, para uma pessoa só, de um jeito impossível de
 * reproduzir.
 */
export function lerMapeamento(bruto: unknown): Mapeamento {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};

  const limpo: Mapeamento = {};
  for (const [turnoId, valor] of Object.entries(bruto as Record<string, unknown>)) {
    const v = valor as Partial<EventoConhecido> | null;
    if (!turnoId || !v || typeof v !== 'object') continue;
    if (typeof v.eventoId !== 'string' || !v.eventoId) continue;

    limpo[turnoId] = {
      eventoId: v.eventoId,
      assinatura: typeof v.assinatura === 'string' ? v.assinatura : '',
      dia: typeof v.dia === 'string' ? v.dia : '',
    };
  }
  return limpo;
}
