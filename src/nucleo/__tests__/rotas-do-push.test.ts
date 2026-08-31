/**
 * O mapa de rotas do push.
 *
 * Este é o bug clássico de notificação, e o mais difícil de perceber: o usuário toca no
 * push, o app abre na tela inicial em vez do destino, e ninguém reporta — porque não houve
 * erro nenhum, só um lugar errado.
 *
 * Acontece porque o backend guarda o destino como caminho do SITE (`/dashboard/trocas`),
 * que foi o que existiu primeiro. O app tem outra árvore de navegação.
 */
import { describe, expect, it } from 'vitest';
import { rotaDaNotificacao, ehDestinoDeCobranca, CATEGORIAS_MAPEADAS } from '@/nucleo/rotas-do-push';

describe('Tradução do caminho do site', () => {
  it.each([
    ['/dashboard/escala', '/minha-escala'],
    ['/dashboard/trocas', '/trocas'],
    ['/dashboard/afastamentos', '/afastamentos'],
    ['/dashboard/admin/requests', '/solicitacoes'],
  ])('%s vira %s', (doSite, noApp) => {
    expect(rotaDaNotificacao({ metadata: { target_path: doSite } })).toBe(noApp);
  });

  it('ignora a query string — o app roteia por caminho', () => {
    expect(rotaDaNotificacao({ metadata: { target_path: '/dashboard/trocas?status=pendente' } }))
      .toBe('/trocas');
  });

  it('ignora a âncora', () => {
    expect(rotaDaNotificacao({ metadata: { target_path: '/dashboard/escala#hoje' } }))
      .toBe('/minha-escala');
  });

  it('aceita os outros nomes de campo que o site também aceita', () => {
    expect(rotaDaNotificacao({ metadata: { deep_link: '/dashboard/trocas' } })).toBe('/trocas');
    expect(rotaDaNotificacao({ metadata: { route: '/dashboard/afastamentos' } })).toBe('/afastamentos');
  });

  it('lê de `data` também — é onde o payload do push entrega', () => {
    // A metadata da notificação in-app e o `data` do push carregam a mesma coisa.
    expect(rotaDaNotificacao({ data: { target_path: '/dashboard/trocas' } })).toBe('/trocas');
  });
});

describe('Padrão por categoria, quando não há caminho', () => {
  it.each([
    ['shift_swap', '/trocas'],
    ['absence_request_result', '/afastamentos'],
    ['pending_admin_requests', '/solicitacoes'],
    ['schedule_alerts', '/minha-escala'],
  ])('categoria %s abre %s', (categoria, rota) => {
    expect(rotaDaNotificacao({ category: categoria })).toBe(rota);
  });

  it('o caminho explícito vence a categoria', () => {
    expect(rotaDaNotificacao({
      category: 'shift_swap',
      metadata: { target_path: '/dashboard/afastamentos' },
    })).toBe('/afastamentos');
  });
});

describe('Cobrança nunca abre paywall', () => {
  /**
   * Oito `target_path` do backend apontam para a tela de assinatura. Um push de "sua
   * assinatura venceu" abrindo tela de preço dentro do app é exatamente o que a regra
   * 3.1.3(f) da Apple reprova — e é ruído para o funcionário, que não é quem paga.
   */
  it('o caminho de cobrança leva à tela neutra', () => {
    expect(rotaDaNotificacao({ metadata: { target_path: '/dashboard/settings?tab=billing' } }))
      .toBe('/indisponivel');
  });

  it('a categoria de cobrança também', () => {
    expect(rotaDaNotificacao({ category: 'BILLING' })).toBe('/indisponivel');
  });

  it('qualquer aba de configurações cai no mesmo lugar', () => {
    // O app não tem tela de configurações do gestor; tudo isso é web.
    expect(rotaDaNotificacao({ metadata: { target_path: '/dashboard/settings?tab=perfil' } }))
      .toBe('/indisponivel');
  });

  it('a navegação consegue reconhecer o destino de bloqueio', () => {
    expect(ehDestinoDeCobranca('/indisponivel')).toBe(true);
    expect(ehDestinoDeCobranca('/trocas')).toBe(false);
  });
});

describe('O que o app não conhece', () => {
  /**
   * O servidor ganha destinos novos a cada deploy; o app instalado não sabe deles. Cair na
   * tela inicial é a degradação certa — errar de tela é ruim, não abrir é pior.
   */
  it('caminho desconhecido abre a tela inicial, não erro', () => {
    expect(rotaDaNotificacao({ metadata: { target_path: '/dashboard/relatorios/novo' } }))
      .toBe('/minha-escala');
  });

  it('categoria desconhecida também', () => {
    expect(rotaDaNotificacao({ category: 'recurso_que_ainda_nao_existe' })).toBe('/minha-escala');
  });

  it('notificação sem nada abre a tela inicial', () => {
    expect(rotaDaNotificacao({})).toBe('/minha-escala');
  });

  it('caminho absoluto de outro site é ignorado', () => {
    // Nunca navegar para fora a partir de um push: o destino tem que ser interno.
    expect(rotaDaNotificacao({ metadata: { target_path: 'https://outro-site.com/x' } }))
      .toBe('/minha-escala');
  });

  it('valor que não é texto não quebra', () => {
    expect(rotaDaNotificacao({ metadata: { target_path: 42 as unknown as string } }))
      .toBe('/minha-escala');
  });
});

/**
 * O mapa de categorias contra o que o backend EMITE — não contra o que o site mapeia.
 *
 * Uma auditoria encontrou as duas listas divergindo em três pontos, e o custo era concreto:
 * "escala publicada" é o aviso mais relevante que um funcionário recebe, e tocar nele abria
 * a tela inicial. As emissões de publicação carregam só período e contagem no `metadata`,
 * sem `target_path` — sem entrada no mapa, não há destino.
 *
 * Estes casos existem para a lista não voltar a derivar em silêncio. Se alguém acrescentar
 * categoria no backend, é aqui que a falta aparece.
 */
describe('mapa de categorias × o que o backend emite', () => {
  /**
   * As sete categorias emitidas, verificadas no backend em 31/08/2026.
   *
   * A lista é escrita à mão de propósito: copiá-la do código do app faria o teste concordar
   * consigo mesmo. O valor está em ela vir da outra ponta.
   */
  const EMITIDAS_PELO_BACKEND = [
    'shift_swap',                 // request.service.js:703,952,1236,1283
    'pending_admin_requests',     // request.service.js:907
    'pending_absence_requests',   // absence.service.js:607
    'absence_request_result',     // absence.service.js:679,713
    'schedule_published',         // shift.service.js:2126 — para o MEMBRO
    'schedule_publish_summary',   // shift.service.js:2143,2157 — para ADMIN/OWNER
    'BILLING',
  ];

  /**
   * A asserção é sobre o MAPA, e não sobre o resultado.
   *
   * Olhar só o retorno não distingue "mapeada para `/minha-escala`" de "não mapeada, caiu
   * no destino inicial" — que é o mesmo caminho. A primeira versão deste teste caiu nessa:
   * apagar a entrada de `schedule_published` passava verde.
   */
  it.each(EMITIDAS_PELO_BACKEND)('a categoria %s está no mapa', (categoria) => {
    expect(CATEGORIAS_MAPEADAS).toContain(categoria);
  });

  /**
   * O caso que motivou tudo: sem entrada no mapa, esta categoria caía no destino inicial —
   * que por acaso É `/minha-escala`. Por isso o teste não pode se contentar com "tem
   * destino": ele fixa que o destino veio do mapa, comparando com uma categoria desconhecida.
   */
  it('escala publicada leva à escala do funcionário, e não ao destino inicial por acaso', () => {
    const publicada = rotaDaNotificacao({ category: 'schedule_published', metadata: {} });
    const resumo = rotaDaNotificacao({ category: 'schedule_publish_summary', metadata: {} });

    // As duas metades: o destino certo, E que ele veio de uma entrada e não da queda.
    expect(CATEGORIAS_MAPEADAS).toContain('schedule_published');
    expect(publicada).toBe('/minha-escala');
    // O resumo é só para ADMIN/OWNER, então vai para a escala da equipe — e é isso que
    // distingue um destino escolhido de um destino que sobrou.
    expect(resumo).toBe('/escala');
  });

  /**
   * `schedule_alerts` estava mapeada aqui e no site, e o backend nunca a emitiu. Entrada
   * morta não quebra nada — só engana quem lê, e sugere que existe um caminho que não existe.
   */
  it('não sobrou entrada para categoria que o backend não emite', () => {
    expect(CATEGORIAS_MAPEADAS).not.toContain('schedule_alerts');
  });

  /**
   * O mapa não pode crescer sozinho. Toda entrada precisa corresponder a uma categoria que
   * o backend realmente emite — foi assim que `schedule_alerts` sobreviveu em dois clientes
   * apontando para uma tela que nunca seria aberta por ela.
   */
  it('o mapa não tem entrada além do que o backend emite', () => {
    expect([...CATEGORIAS_MAPEADAS].sort()).toEqual([...EMITIDAS_PELO_BACKEND].sort());
  });
});
