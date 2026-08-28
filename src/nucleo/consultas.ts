import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import { apiFetch, type ErroApi } from './api';
import type { PortaoDeVersao } from './versao';

/**
 * As consultas do aplicativo, num lugar só.
 *
 * Espalhar `useQuery` pelas telas produz três problemas que só aparecem depois: chaves de
 * cache escritas de formas diferentes (e portanto invalidação que não invalida), o mesmo
 * dado buscado duas vezes por telas vizinhas, e cada tela decidindo sozinha o que fazer com
 * erro de rede.
 *
 * Três coisas ficam expostas de propósito, porque são as que quebram em silêncio:
 *
 *   - **`rotas`** — os caminhos exatos. Um erro aqui vira 403 ou 404 em campo, e nenhum
 *     `tsc` pega. Com as strings soltas em `rotas`, o teste as compara com o backend.
 *   - **`chaves`** — invalidar corretamente depende de todo mundo concordar sobre o nome.
 *   - **as fábricas de opções** (`opcoesResponderTroca`, etc.) — devolvem o objeto que o
 *     `useMutation` consome, o que torna invalidação de cache e desfazimento otimista
 *     testáveis sem montar componente nenhum.
 */

export const rotas = {
  portaoDeVersao: '/app/version-gate',

  painel: '/users/me/dashboard',
  turnosDoMes: (mes: string) => `/users/me/shifts?month=${mes}`,

  /**
   * As duas listas do funcionário saem da MESMA rota, mudando `mine_mode`.
   *
   * `/requests/inbox` parece o caminho óbvio para "as que esperam por mim" e não é: ela exige
   * OWNER ou ADMIN mais `module_shift_requests_admin` (`request.routes.js:52`). É a caixa de
   * entrada do GESTOR. Um funcionário chamando aquilo toma 403 — e como 403 não é retentado,
   * a tela mostraria "sem acesso" para quem tem acesso.
   */
  trocasQueEuPedi: '/requests/mine?mine_mode=requester',
  trocasParaMim: '/requests/mine?mine_mode=target',
  responderTroca: (id: string, aceitar: boolean) => `/requests/${id}/${aceitar ? 'target-accept' : 'target-reject'}`,

  /**
   * `status` é obrigatório na prática: `listRequestsQuerySchema` tem
   * `.default('PENDING_ADMIN_APPROVAL')`, então omitir não traz tudo — traz só as pendentes.
   * Passar sempre, explícito, evita a tela dizer "você não pediu nada" para quem pediu e já
   * teve aprovado.
   */
  afastamentosMeus: (situacao: string) => `/absences/requests/mine?status=${situacao}`,
  pedirAfastamento: '/absences/requests',

  trocasParaAprovar: '/requests/inbox?state=OPEN',
  afastamentosParaAprovar: '/absences/requests?status=PENDING_ADMIN_APPROVAL',

  notificacoes: '/notifications?status=ALL',
  resumoNotificacoes: '/notifications/summary',
  marcarLida: (id: string) => `/notifications/${id}/read`,
  marcarTodasLidas: '/notifications/mark-all-read',
  registrarClique: (id: string) => `/notifications/${id}/click`,
} as const;

export const chaves = {
  portaoDeVersao: ['app', 'portao-de-versao'] as const,

  painel: ['me', 'painel'] as const,
  turnosDoMes: (mes: string) => ['me', 'turnos', mes] as const,

  trocasQueEuPedi: ['trocas', 'requester'] as const,
  trocasParaMim: ['trocas', 'target'] as const,

  afastamentosMeus: (situacao: string) => ['afastamentos', 'meus', situacao] as const,

  trocasParaAprovar: ['gestor', 'trocas'] as const,
  afastamentosParaAprovar: ['gestor', 'afastamentos'] as const,

  notificacoes: ['notificacoes', 'lista'] as const,
  resumoNotificacoes: ['notificacoes', 'resumo'] as const,
};

// ── Tipos do que a API devolve ──────────────────────────────────────────────

export type Turno = {
  id: string;
  start_timestamp: string;
  end_timestamp: string;
  status?: string | null;
  location?: { id?: string | null; name?: string | null } | null;
  shift_model?: { id?: string | null; name?: string | null } | null;
};

export type Painel = {
  next_shift: Turno | null;
  upcoming_shifts: Turno[];
  past_shifts: Turno[];
  summary_period?: {
    total_shifts?: number;
    total_hours?: number;
  };
  period_metrics?: {
    hours_in_period?: number;
    overtime_hours_in_period?: number;
    workload_contract_limit_hours?: number | null;
  };
};

export type Troca = {
  id: string;
  type: string;
  mode?: string | null;
  status: string;
  requester_member_id?: string | null;
  target_member_id?: string | null;
  requester?: { id: string; name?: string | null } | null;
  target?: { id: string; name?: string | null } | null;
  source_shift?: Turno | null;
  target_shift?: Turno | null;
  created_at: string;
  expires_at?: string | null;
};

export type Afastamento = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  review_reason?: string | null;
  reviewed_at?: string | null;
  created_at: string;
};

export type AfastamentoParaAprovar = Afastamento & {
  requester_name?: string | null;
  target_name?: string | null;
};

export type Notificacao = {
  id: string;
  category: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  status: string;
  seen_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type ResumoDeNotificacoes = {
  has_personal_notifications: boolean;
  personal_notifications_count: number;
};

type Envelope<T> = { data: T };
type Listagem<T> = { data: { items: T[] } };

/**
 * Quando vale a pena tentar de novo.
 *
 * Uma retentativa porque no celular a primeira falha costuma ser oscilação de rede, e a
 * segunda tentativa resolve. Mais que isso só atrasa a mensagem de erro para quem está sem
 * sinal — e no celular a espera é percebida em dobro.
 *
 * 401, 402 e 403 nunca são retentados: nenhum deles muda em três segundos. Repetir um 402
 * ainda gasta cota de API do gestor inadimplente, que é o oposto do que queremos.
 *
 * Exportada para ter teste próprio: é uma decisão que ninguém percebe estar errada até o app
 * estar martelando o servidor em campo.
 */
export function politicaDeRetentativa(tentativa: number, erro: unknown): boolean {
  const status = (erro as ErroApi)?.status;
  if (status === 401 || status === 402 || status === 403) return false;
  return tentativa < 1;
}

const PADRAO = { retry: politicaDeRetentativa };

// ── Portão de versão ────────────────────────────────────────────────────────

/**
 * A rota é pública e não passa pelo portão de cobrança: o app precisa perguntar ANTES de ter
 * sessão, senão alguém preso numa versão incompatível não conseguiria nem descobrir o
 * motivo.
 *
 * Uma consulta por abertura basta — o portão muda por variável de ambiente, não por minuto —
 * e `retry: false` porque falhar aqui nunca pode bloquear ninguém: sem resposta, o veredicto
 * é "ok".
 */
export function usePortaoDeVersao() {
  return useQuery({
    queryKey: chaves.portaoDeVersao,
    queryFn: () => apiFetch<Envelope<PortaoDeVersao>>(rotas.portaoDeVersao).then((r) => r.data),
    retry: false,
    staleTime: 60 * 60 * 1000,
  });
}

// ── Escala ──────────────────────────────────────────────────────────────────

export function usePainel() {
  return useQuery({
    queryKey: chaves.painel,
    queryFn: () => apiFetch<Envelope<Painel>>(rotas.painel).then((r) => r.data),
    ...PADRAO,
  });
}

/** `mes` no formato AAAA-MM, que é o que `meShiftsByMonthQuerySchema` exige. */
export function useTurnosDoMes(mes: string, habilitado = true) {
  return useQuery({
    queryKey: chaves.turnosDoMes(mes),
    queryFn: () => apiFetch<Envelope<{ items: Turno[] }>>(rotas.turnosDoMes(mes))
      .then((r) => r.data.items),
    enabled: habilitado && /^\d{4}-\d{2}$/.test(mes),
    ...PADRAO,
  });
}

// ── Trocas ──────────────────────────────────────────────────────────────────

export function useTrocasQueEuPedi() {
  return useQuery({
    queryKey: chaves.trocasQueEuPedi,
    queryFn: () => apiFetch<Listagem<Troca>>(rotas.trocasQueEuPedi).then((r) => r.data.items),
    ...PADRAO,
  });
}

/** As que esperam resposta minha — é a lista que tem ação. */
export function useTrocasParaMim() {
  return useQuery({
    queryKey: chaves.trocasParaMim,
    queryFn: () => apiFetch<Listagem<Troca>>(rotas.trocasParaMim).then((r) => r.data.items),
    ...PADRAO,
  });
}

export type RespostaDeTroca = { id: string; aceitar: boolean };

export function opcoesResponderTroca(
  cliente: QueryClient,
): UseMutationOptions<unknown, ErroApi, RespostaDeTroca> {
  return {
    mutationFn: ({ id, aceitar }) => apiFetch(rotas.responderTroca(id, aceitar), {
      method: 'POST',
      body: '{}',
    }),
    onSuccess: () => {
      // Três caches mudam, e esquecer qualquer um deixa a tela mentindo: a troca sai das
      // pendências, entra no histórico, e a escala muda de dono.
      cliente.invalidateQueries({ queryKey: chaves.trocasParaMim });
      cliente.invalidateQueries({ queryKey: chaves.trocasQueEuPedi });
      cliente.invalidateQueries({ queryKey: chaves.painel });
    },
  };
}

export function useResponderTroca() {
  const cliente = useQueryClient();
  return useMutation(opcoesResponderTroca(cliente));
}

// ── Afastamentos ────────────────────────────────────────────────────────────

export type SituacaoDeAfastamento =
  | 'PENDING_ADMIN_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export function useAfastamentosMeus(situacao: SituacaoDeAfastamento) {
  return useQuery({
    queryKey: chaves.afastamentosMeus(situacao),
    queryFn: () => apiFetch<Envelope<{ items: Afastamento[] }>>(rotas.afastamentosMeus(situacao))
      .then((r) => r.data.items),
    ...PADRAO,
  });
}

export type NovoAfastamento = { start_date: string; end_date: string; reason: string };

export function opcoesPedirAfastamento(
  cliente: QueryClient,
): UseMutationOptions<unknown, ErroApi, NovoAfastamento> {
  return {
    mutationFn: (payload) => apiFetch(rotas.pedirAfastamento, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      // Só a lista de pendentes ganha item novo — as outras três não mudam, e invalidar
      // todas custaria três requisições para nada.
      cliente.invalidateQueries({ queryKey: chaves.afastamentosMeus('PENDING_ADMIN_APPROVAL') });
    },
  };
}

export function usePedirAfastamento() {
  const cliente = useQueryClient();
  return useMutation(opcoesPedirAfastamento(cliente));
}

// ── Fila do gestor ──────────────────────────────────────────────────────────

/**
 * As duas filas que esperam decisão do gestor.
 *
 * Ambas exigem OWNER ou ADMIN no servidor, então as telas só devem chamá-las depois de
 * conferir a capacidade — `enabled` existe para isso. Chamar sem permissão dá 403, que não é
 * retentado e vira "sem acesso" na tela, o que assusta à toa.
 */
export function useTrocasParaAprovar(habilitado = true) {
  return useQuery({
    queryKey: chaves.trocasParaAprovar,
    queryFn: () => apiFetch<Listagem<Troca>>(rotas.trocasParaAprovar).then((r) => r.data.items),
    enabled: habilitado,
    ...PADRAO,
  });
}

export function useAfastamentosParaAprovar(habilitado = true) {
  return useQuery({
    queryKey: chaves.afastamentosParaAprovar,
    queryFn: () => apiFetch<Envelope<{ items: AfastamentoParaAprovar[] }>>(
      rotas.afastamentosParaAprovar,
    ).then((r) => r.data.items),
    enabled: habilitado,
    ...PADRAO,
  });
}

// ── Notificações ────────────────────────────────────────────────────────────

export function useNotificacoes() {
  return useQuery({
    queryKey: chaves.notificacoes,
    queryFn: () => apiFetch<Listagem<Notificacao>>(rotas.notificacoes).then((r) => r.data.items),
    ...PADRAO,
  });
}

export function useResumoNotificacoes() {
  return useQuery({
    queryKey: chaves.resumoNotificacoes,
    queryFn: () => apiFetch<Envelope<ResumoDeNotificacoes>>(rotas.resumoNotificacoes)
      .then((r) => r.data),
    ...PADRAO,
  });
}

type ContextoDeLeitura = { anterior?: Notificacao[] };

export function opcoesMarcarLida(
  cliente: QueryClient,
): UseMutationOptions<unknown, ErroApi, string, ContextoDeLeitura> {
  return {
    mutationFn: (id) => apiFetch(rotas.marcarLida(id), { method: 'POST', body: '{}' }),

    // Atualização otimista: marcar como lida é ação sem risco, e esperar a rede faz a lista
    // piscar a cada toque. Se falhar, o `onError` devolve o estado anterior inteiro — não
    // tenta "desmarcar" o item, que erraria se o servidor já o tivesse marcado por outra via.
    onMutate: async (id) => {
      await cliente.cancelQueries({ queryKey: chaves.notificacoes });
      const anterior = cliente.getQueryData<Notificacao[]>(chaves.notificacoes);

      cliente.setQueryData<Notificacao[]>(chaves.notificacoes, (itens) => (itens || []).map(
        (n) => (n.id === id ? { ...n, status: 'READ', read_at: new Date().toISOString() } : n),
      ));

      return { anterior };
    },

    onError: (_erro, _id, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(chaves.notificacoes, contexto.anterior);
    },

    // O contador do cabeçalho vem de outra rota e não é atualizado otimisticamente: errar
    // para menos num selo é irritante, errar para mais é alarme falso.
    onSettled: () => {
      cliente.invalidateQueries({ queryKey: chaves.resumoNotificacoes });
    },
  };
}

export function useMarcarLida() {
  const cliente = useQueryClient();
  return useMutation(opcoesMarcarLida(cliente));
}

export function opcoesMarcarTodasLidas(
  cliente: QueryClient,
): UseMutationOptions<unknown, ErroApi, void> {
  return {
    mutationFn: () => apiFetch(rotas.marcarTodasLidas, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: chaves.notificacoes });
      cliente.invalidateQueries({ queryKey: chaves.resumoNotificacoes });
    },
  };
}

export function useMarcarTodasLidas() {
  const cliente = useQueryClient();
  return useMutation(opcoesMarcarTodasLidas(cliente));
}

/**
 * Registra o clique antes de navegar.
 *
 * Nunca bloqueia a navegação: se falhar, a pessoa ainda chega onde queria — perder um evento
 * de telemetria é melhor que travar uma tela.
 *
 * Mas não é só telemetria: `clickSchema` tem `mark_as_read` com padrão `true`
 * (`notification.validator.js:68`), então o servidor MARCA COMO LIDA neste mesmo POST. Por
 * isso as duas listas são invalidadas depois — sem isso, a notificação continuaria em negrito
 * no app enquanto o servidor já a considera lida.
 */
export function opcoesRegistrarClique(
  cliente: QueryClient,
): UseMutationOptions<unknown, ErroApi, string> {
  return {
    mutationFn: (id) => apiFetch(rotas.registrarClique(id), {
      method: 'POST',
      body: JSON.stringify({ source: 'app' }),
    }),
    onSettled: () => {
      cliente.invalidateQueries({ queryKey: chaves.notificacoes });
      cliente.invalidateQueries({ queryKey: chaves.resumoNotificacoes });
    },
  };
}

export function useRegistrarClique() {
  const cliente = useQueryClient();
  return useMutation(opcoesRegistrarClique(cliente));
}
