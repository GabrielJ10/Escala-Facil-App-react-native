/**
 * Regras de apresentação, separadas das telas.
 *
 * Uma tela em React Native é difícil de testar sem montar meio ambiente nativo — e testar
 * pixel raramente pega defeito de verdade. O que pega são as decisões: qual texto aparece
 * num erro 402, se o botão de aceitar deve existir, se o formulário pode ser enviado.
 *
 * Essas decisões moram aqui, em funções puras, e têm teste. As telas ficam sendo o que
 * deviam ser: arranjo visual do que estas funções decidiram.
 */
import type { ErroApi } from './api';
import { toDateKeyInTimezone } from '@/contract/dateInTimezone';

// ── Erros ───────────────────────────────────────────────────────────────────

export type TipoDeErro = 'assinatura' | 'permissao' | 'rede' | 'generico';

export type MensagemDeErro = {
  tipo: TipoDeErro;
  titulo: string;
  detalhe: string;
  podeTentarDeNovo: boolean;
};

/**
 * Traduz um erro para o que a pessoa lê.
 *
 * Quatro casos, porque a ação de quem lê é diferente em cada um:
 *
 *   - **402**: a assinatura da organização está suspensa. O funcionário não é quem paga e
 *     não tem o que fazer no app. Mandá-lo para uma tela de preço seria inútil, e é
 *     exatamente o que a regra 3.1.3(f) da Apple reprova — por isso o texto não cita valor,
 *     plano nem loja. Aponta para o gestor, que é quem resolve.
 *   - **403**: falta permissão. Insistir não muda.
 *   - **sem rede**: não é falha do produto, e tentar de novo resolve.
 *   - **resto**: mostra o que o servidor disse, se disse algo útil.
 */
export function mensagemDeErro(erro: unknown): MensagemDeErro {
  const e = erro as ErroApi | null | undefined;
  const status = e?.status;

  if (status === 402) {
    return {
      tipo: 'assinatura',
      titulo: 'Indisponível no momento',
      detalhe: 'Fale com o gestor da sua equipe para reativar o acesso.',
      podeTentarDeNovo: false,
    };
  }

  if (status === 403) {
    return {
      tipo: 'permissao',
      titulo: 'Sem acesso',
      detalhe: 'Você não tem permissão para ver isto.',
      podeTentarDeNovo: false,
    };
  }

  // Erro sem status é falha de rede: o fetch nem chegou a receber resposta.
  if (status === undefined) {
    return {
      tipo: 'rede',
      titulo: 'Sem conexão',
      detalhe: 'Verifique sua internet. O que já foi carregado continua disponível.',
      podeTentarDeNovo: true,
    };
  }

  const doServidor = typeof e?.message === 'string' ? e.message.trim() : '';
  return {
    tipo: 'generico',
    titulo: 'Não foi possível carregar',
    detalhe: doServidor || 'Tente novamente em instantes.',
    podeTentarDeNovo: true,
  };
}

// ── Trocas ──────────────────────────────────────────────────────────────────

const SITUACAO_DA_TROCA: Record<string, string> = {
  PENDING_TARGET_ACCEPTANCE: 'Esperando você',
  TARGET_ACCEPTED: 'Esperando o gestor',
  PENDING_ADMIN_APPROVAL: 'Esperando o gestor',
  ADMIN_APPROVED: 'Aprovada',
  EXECUTED: 'Concluída',
  ADMIN_REJECTED: 'Recusada pelo gestor',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
};

export function rotuloDaSituacaoDaTroca(status: string | null | undefined): string {
  return SITUACAO_DA_TROCA[String(status || '')] || 'Em andamento';
}

/** As situações em que a troca ainda pode mudar — separam as ativas das encerradas. */
const TROCAS_ABERTAS = new Set([
  'PENDING_TARGET_ACCEPTANCE',
  'TARGET_ACCEPTED',
  'PENDING_ADMIN_APPROVAL',
]);

export function trocaEstaAberta(status: string | null | undefined): boolean {
  return TROCAS_ABERTAS.has(String(status || ''));
}

type TrocaParaDecisao = {
  status?: string | null;
  expires_at?: string | null;
  target?: { id?: string } | null;
  target_member_id?: string | null;
};

/**
 * Posso aceitar ou recusar esta troca?
 *
 * Três condições, e a terceira é a que se esquece: o prazo. O servidor marca EXPIRED por
 * job, então existe uma janela em que a solicitação está vencida e ainda diz PENDING. Mostrar
 * o botão nessa janela produz o pior tipo de erro — a pessoa toca, espera, e recebe uma
 * recusa que não entende. Melhor não oferecer.
 */
export function podeResponderTroca(
  troca: TrocaParaDecisao,
  meuMembroId: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (troca?.status !== 'PENDING_TARGET_ACCEPTANCE') return false;

  const alvo = troca.target?.id ?? troca.target_member_id ?? null;
  if (!meuMembroId || !alvo || alvo !== meuMembroId) return false;

  if (troca.expires_at) {
    const prazo = new Date(troca.expires_at).getTime();
    if (Number.isFinite(prazo) && prazo <= agora.getTime()) return false;
  }

  return true;
}

// ── Afastamentos ────────────────────────────────────────────────────────────

const SITUACAO_DO_AFASTAMENTO: Record<string, string> = {
  PENDING_ADMIN_APPROVAL: 'Em análise',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  CANCELLED: 'Cancelado',
};

export function rotuloDaSituacaoDoAfastamento(status: string | null | undefined): string {
  return SITUACAO_DO_AFASTAMENTO[String(status || '')] || 'Em análise';
}

export type PedidoDeAfastamento = {
  inicio: string;
  fim: string;
  motivo: string;
};

/**
 * Valida o pedido antes de gastar uma ida ao servidor.
 *
 * As regras são as mesmas de `createRequestSchema` no backend — repetidas de propósito, para
 * que a pessoa veja o problema enquanto digita em vez de depois de esperar a rede. O servidor
 * continua sendo a autoridade; isto é conveniência, não confiança.
 */
export function validarPedidoDeAfastamento(pedido: PedidoDeAfastamento): string[] {
  const erros: string[] = [];
  const formatoDeData = /^\d{4}-\d{2}-\d{2}$/;

  if (!formatoDeData.test(pedido.inicio || '')) {
    erros.push('Informe a data de início no formato AAAA-MM-DD.');
  }
  if (!formatoDeData.test(pedido.fim || '')) {
    erros.push('Informe a data de fim no formato AAAA-MM-DD.');
  }

  // Comparação como texto funciona e é exata para ISO 8601: não cria Date, e portanto não
  // erra o dia por fuso — que é o defeito clássico de validar data no cliente.
  if (erros.length === 0 && pedido.fim < pedido.inicio) {
    erros.push('A data de fim não pode ser anterior à data de início.');
  }

  if ((pedido.motivo || '').trim().length < 2) {
    erros.push('Descreva o motivo em pelo menos 2 caracteres.');
  }

  return erros;
}

// ── Notificações ────────────────────────────────────────────────────────────

export function naoFoiLida(notificacao: { status?: string | null; read_at?: string | null }): boolean {
  return !notificacao?.read_at && notificacao?.status !== 'READ';
}

export function contarNaoLidas(itens: Array<{ status?: string | null; read_at?: string | null }>): number {
  return (itens || []).filter(naoFoiLida).length;
}

// ── Turnos ──────────────────────────────────────────────────────────────────

export type DiaDeTurnos<T> = { dia: string; turnos: T[] };

/**
 * Agrupa turnos por dia, no fuso da ORGANIZAÇÃO.
 *
 * O fuso não é detalhe: `start_timestamp` chega em UTC, e cortar a string no `T` dá o dia
 * UTC. Um turno que começa 22h em Brasília é `01:00Z` do dia seguinte — e apareceria no dia
 * errado da escala, sem erro nenhum na tela. É exatamente o defeito que `dateInTimezone.ts`
 * foi escrito para corrigir na grade do site; reimplementar o agrupamento aqui repetiria o
 * mesmo erro em outro lugar.
 *
 * Por isso o dia sai de `toDateKeyInTimezone`, do contrato compartilhado: os dois clientes
 * agrupam pela mesma regra, e a regra tem teste no contrato.
 *
 * O fuso vem de `organization.settings` via `resolveTenantTimezone`, com Brasília de reserva.
 */
export function agruparTurnosPorDia<T extends { start_timestamp: string }>(
  turnos: T[],
  fusoDaOrganizacao: string,
): Array<DiaDeTurnos<T>> {
  const porDia = new Map<string, T[]>();

  for (const turno of turnos || []) {
    const dia = toDateKeyInTimezone(turno?.start_timestamp, fusoDaOrganizacao);
    if (!dia) continue;
    const lista = porDia.get(dia);
    if (lista) lista.push(turno);
    else porDia.set(dia, [turno]);
  }

  // Cada dia sai em ordem cronológica; empate desempata pelo id, como o backend faz.
  for (const lista of porDia.values()) {
    lista.sort((a, b) => (a.start_timestamp < b.start_timestamp ? -1 : 1));
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, lista]) => ({ dia, turnos: lista }));
}
