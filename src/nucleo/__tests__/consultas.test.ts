/**
 * A camada de consultas.
 *
 * Três classes de defeito moram aqui, e nenhuma delas é pega por `tsc`:
 *
 *   1. **rota errada** — vira 403 ou 404 só em campo, num aparelho de alguém;
 *   2. **invalidação incompleta** — a tela continua mostrando o estado antigo depois da
 *      ação, e a pessoa conclui que o toque não funcionou e repete;
 *   3. **otimismo sem desfazimento** — a lista mostra "lida" para sempre, mesmo com o
 *      servidor tendo recusado.
 *
 * As fábricas de opções existem para tornar 2 e 3 testáveis sem montar componente nativo.
 */
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('@/nucleo/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const {
  chaves,
  rotas,
  politicaDeRetentativa,
  opcoesMarcarLida,
  opcoesMarcarTodasLidas,
  opcoesPedirAfastamento,
  opcoesRegistrarClique,
  opcoesResponderTroca,
} = await import('@/nucleo/consultas');

function novoCliente() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Roda uma mutação de ponta a ponta, incluindo os ganchos, sem renderizar nada. */
async function mutar<V>(cliente: QueryClient, opcoes: object, valor: V) {
  const observador = new MutationObserver(cliente, opcoes as never);
  try {
    await observador.mutate(valor as never);
  } catch {
    // O erro em si é observado pelo teste através do estado do cache.
  }
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ data: { items: [] } });
});

describe('rotas', () => {
  /**
   * O erro que este teste existe para impedir.
   *
   * `/requests/inbox` parece a rota óbvia para "trocas que esperam por mim" — e é a caixa de
   * entrada do GESTOR: exige OWNER ou ADMIN mais `module_shift_requests_admin`
   * (`request.routes.js:52`). Um funcionário chamando aquilo toma 403; como 403 não é
   * retentado, a tela diz "sem acesso" para quem tem acesso.
   *
   * As duas listas do funcionário saem da mesma rota, mudando `mine_mode`.
   */
  it('a lista do funcionário nunca usa a caixa de entrada do gestor', () => {
    expect(rotas.trocasParaMim).toBe('/requests/mine?mine_mode=target');
    expect(rotas.trocasQueEuPedi).toBe('/requests/mine?mine_mode=requester');

    expect(rotas.trocasParaMim).not.toContain('/requests/inbox');
    expect(rotas.trocasQueEuPedi).not.toContain('/requests/inbox');
  });

  it('a fila do gestor é que usa a caixa de entrada', () => {
    expect(rotas.trocasParaAprovar).toBe('/requests/inbox?state=OPEN');
  });

  it('aceitar e recusar batem nos verbos do backend', () => {
    expect(rotas.responderTroca('abc', true)).toBe('/requests/abc/target-accept');
    expect(rotas.responderTroca('abc', false)).toBe('/requests/abc/target-reject');
  });

  /**
   * `listRequestsQuerySchema` tem `.default('PENDING_ADMIN_APPROVAL')`. Omitir o status não
   * traz tudo — traz só as pendentes, e a tela diria "você não pediu nada" para quem já teve
   * um pedido aprovado.
   */
  it('a lista de afastamentos sempre manda o status, nunca deixa no padrão', () => {
    expect(rotas.afastamentosMeus('APPROVED')).toBe('/absences/requests/mine?status=APPROVED');
    expect(rotas.afastamentosMeus('PENDING_ADMIN_APPROVAL')).toContain('status=');
  });

  it('o mês da escala vai no formato que o backend valida', () => {
    expect(rotas.turnosDoMes('2026-09')).toBe('/users/me/shifts?month=2026-09');
  });

  it('o portão de versão é a rota pública', () => {
    expect(rotas.portaoDeVersao).toBe('/app/version-gate');
  });
});

describe('politicaDeRetentativa', () => {
  const erro = (status?: number) => Object.assign(new Error('x'), { status });

  it('tenta uma vez a mais em falha de rede', () => {
    expect(politicaDeRetentativa(0, erro(undefined))).toBe(true);
    expect(politicaDeRetentativa(1, erro(undefined))).toBe(false);
  });

  it('erro do servidor merece uma segunda tentativa', () => {
    expect(politicaDeRetentativa(0, erro(500))).toBe(true);
  });

  /**
   * Nenhum destes muda em três segundos. Repetir um 402 ainda gasta cota de API do gestor
   * inadimplente — o oposto do que se quer quando a conta está no vermelho.
   */
  it.each([401, 402, 403])('%d nunca é retentado', (status) => {
    expect(politicaDeRetentativa(0, erro(status))).toBe(false);
  });

  it('erro sem forma conhecida ainda retenta uma vez', () => {
    expect(politicaDeRetentativa(0, 'texto solto')).toBe(true);
    expect(politicaDeRetentativa(0, null)).toBe(true);
  });
});

describe('responder troca', () => {
  it('aceitar invalida as duas listas E a escala', async () => {
    const cliente = novoCliente();
    apiFetch.mockResolvedValue({ success: true });

    const invalidadas: unknown[] = [];
    vi.spyOn(cliente, 'invalidateQueries').mockImplementation((filtro) => {
      invalidadas.push((filtro as { queryKey: unknown }).queryKey);
      return Promise.resolve();
    });

    await mutar(cliente, opcoesResponderTroca(cliente), { id: 'troca-1', aceitar: true });

    expect(invalidadas).toContainEqual(chaves.trocasParaMim);
    expect(invalidadas).toContainEqual(chaves.trocasQueEuPedi);
    // A que se esquece: aceitar uma troca muda de quem é o turno.
    expect(invalidadas).toContainEqual(chaves.painel);
  });

  it('recusar chama o verbo de recusa', async () => {
    const cliente = novoCliente();
    apiFetch.mockResolvedValue({ success: true });

    await mutar(cliente, opcoesResponderTroca(cliente), { id: 'troca-9', aceitar: false });

    expect(apiFetch).toHaveBeenCalledWith(
      '/requests/troca-9/target-reject',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falha não invalida nada — a lista antiga continua correta', async () => {
    const cliente = novoCliente();
    apiFetch.mockRejectedValue(Object.assign(new Error('conflito'), { status: 409 }));

    const invalidar = vi.spyOn(cliente, 'invalidateQueries');
    await mutar(cliente, opcoesResponderTroca(cliente), { id: 'troca-1', aceitar: true });

    expect(invalidar).not.toHaveBeenCalled();
  });
});

describe('marcar notificação como lida', () => {
  const notificacoes = [
    { id: 'n1', status: 'UNREAD', read_at: null, title: 'a', message: 'a', category: 'x', seen_at: null, created_at: '' },
    { id: 'n2', status: 'UNREAD', read_at: null, title: 'b', message: 'b', category: 'x', seen_at: null, created_at: '' },
  ];

  it('marca na hora, antes de a rede responder', async () => {
    const cliente = novoCliente();
    cliente.setQueryData(chaves.notificacoes, notificacoes);

    // Uma promessa que não resolve: congela a mutação depois do onMutate.
    apiFetch.mockImplementation(() => new Promise(() => {}));

    const observador = new MutationObserver(cliente, opcoesMarcarLida(cliente) as never);
    void observador.mutate('n1' as never);
    await vi.waitFor(() => {
      const atual = cliente.getQueryData<typeof notificacoes>(chaves.notificacoes);
      expect(atual?.[0].status).toBe('READ');
    });

    // E só a tocada muda.
    const atual = cliente.getQueryData<typeof notificacoes>(chaves.notificacoes);
    expect(atual?.[1].status).toBe('UNREAD');
  });

  /**
   * O desfazimento.
   *
   * Sem ele a notificação fica marcada como lida para sempre no aparelho, mesmo com o
   * servidor tendo recusado — e a pessoa perde o aviso sem nunca ter lido.
   */
  it('erro devolve a lista exatamente como estava', async () => {
    const cliente = novoCliente();
    cliente.setQueryData(chaves.notificacoes, notificacoes);
    apiFetch.mockRejectedValue(Object.assign(new Error('caiu'), { status: 500 }));

    await mutar(cliente, opcoesMarcarLida(cliente), 'n1');

    expect(cliente.getQueryData(chaves.notificacoes)).toEqual(notificacoes);
  });

  it('o contador é sempre revalidado, dê certo ou errado', async () => {
    for (const resultado of ['ok', 'erro'] as const) {
      const cliente = novoCliente();
      cliente.setQueryData(chaves.notificacoes, notificacoes);

      if (resultado === 'ok') apiFetch.mockResolvedValue({ success: true });
      else apiFetch.mockRejectedValue(new Error('caiu'));

      const invalidadas: unknown[] = [];
      vi.spyOn(cliente, 'invalidateQueries').mockImplementation((filtro) => {
        invalidadas.push((filtro as { queryKey: unknown }).queryKey);
        return Promise.resolve();
      });

      await mutar(cliente, opcoesMarcarLida(cliente), 'n1');
      expect(invalidadas, `caso ${resultado}`).toContainEqual(chaves.resumoNotificacoes);
    }
  });

  it('cache vazio não quebra a atualização otimista', async () => {
    const cliente = novoCliente();
    apiFetch.mockResolvedValue({ success: true });

    await mutar(cliente, opcoesMarcarLida(cliente), 'n1');

    expect(cliente.getQueryData(chaves.notificacoes)).toEqual([]);
  });

  it('marcar todas invalida lista e contador', async () => {
    const cliente = novoCliente();
    apiFetch.mockResolvedValue({ success: true });

    const invalidadas: unknown[] = [];
    vi.spyOn(cliente, 'invalidateQueries').mockImplementation((filtro) => {
      invalidadas.push((filtro as { queryKey: unknown }).queryKey);
      return Promise.resolve();
    });

    await mutar(cliente, opcoesMarcarTodasLidas(cliente), undefined);

    expect(invalidadas).toContainEqual(chaves.notificacoes);
    expect(invalidadas).toContainEqual(chaves.resumoNotificacoes);
  });
});

describe('registrar clique', () => {
  /**
   * Não é só telemetria: `clickSchema` tem `mark_as_read` com padrão `true`
   * (`notification.validator.js:68`), então este POST marca como lida no servidor. Sem
   * invalidar, o app continuaria mostrando negrito no que o servidor já leu.
   */
  it('invalida as listas, porque o servidor também marca como lida', async () => {
    const cliente = novoCliente();
    apiFetch.mockResolvedValue({ success: true });

    const invalidadas: unknown[] = [];
    vi.spyOn(cliente, 'invalidateQueries').mockImplementation((filtro) => {
      invalidadas.push((filtro as { queryKey: unknown }).queryKey);
      return Promise.resolve();
    });

    await mutar(cliente, opcoesRegistrarClique(cliente), 'n1');

    expect(invalidadas).toContainEqual(chaves.notificacoes);
    expect(invalidadas).toContainEqual(chaves.resumoNotificacoes);
  });

  it('manda a origem, para o console do fundador separar app de site', async () => {
    const cliente = novoCliente();
    apiFetch.mockResolvedValue({ success: true });

    await mutar(cliente, opcoesRegistrarClique(cliente), 'n1');

    expect(apiFetch).toHaveBeenCalledWith(
      '/notifications/n1/click',
      expect.objectContaining({ body: JSON.stringify({ source: 'app' }) }),
    );
  });
});

describe('pedir afastamento', () => {
  it('invalida só a lista de pendentes', async () => {
    const cliente = novoCliente();
    apiFetch.mockResolvedValue({ success: true });

    const invalidadas: unknown[] = [];
    vi.spyOn(cliente, 'invalidateQueries').mockImplementation((filtro) => {
      invalidadas.push((filtro as { queryKey: unknown }).queryKey);
      return Promise.resolve();
    });

    await mutar(cliente, opcoesPedirAfastamento(cliente), {
      start_date: '2026-09-01',
      end_date: '2026-09-05',
      reason: 'Consulta',
    });

    // Um pedido novo nasce pendente; as outras três listas não mudaram, e invalidá-las
    // custaria três requisições para nada.
    expect(invalidadas).toEqual([chaves.afastamentosMeus('PENDING_ADMIN_APPROVAL')]);
  });

  it('manda os campos com os nomes que o backend valida', async () => {
    const cliente = novoCliente();
    apiFetch.mockResolvedValue({ success: true });

    await mutar(cliente, opcoesPedirAfastamento(cliente), {
      start_date: '2026-09-01',
      end_date: '2026-09-05',
      reason: 'Consulta',
    });

    // `createRequestSchema` é `.strict()`: um campo a mais e a requisição inteira é recusada.
    const [, opcoes] = apiFetch.mock.calls[0];
    expect(JSON.parse((opcoes as { body: string }).body)).toEqual({
      start_date: '2026-09-01',
      end_date: '2026-09-05',
      reason: 'Consulta',
    });
  });
});

describe('chaves de cache', () => {
  it('as duas listas de troca não compartilham chave', () => {
    // Se compartilhassem, responder uma troca limparia a lista errada — e a tela mostraria
    // pendências que já foram resolvidas.
    expect(chaves.trocasParaMim).not.toEqual(chaves.trocasQueEuPedi);
  });

  it('cada situação de afastamento tem a sua', () => {
    expect(chaves.afastamentosMeus('APPROVED')).not.toEqual(
      chaves.afastamentosMeus('REJECTED'),
    );
  });

  it('cada mês da escala tem a sua', () => {
    expect(chaves.turnosDoMes('2026-09')).not.toEqual(chaves.turnosDoMes('2026-10'));
  });
});
