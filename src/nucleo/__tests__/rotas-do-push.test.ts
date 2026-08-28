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
import { rotaDaNotificacao, ehDestinoDeCobranca } from '@/nucleo/rotas-do-push';

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
