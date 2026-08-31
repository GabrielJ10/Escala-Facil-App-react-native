import { describe, expect, it } from '@jest/globals';

import { comPagina, proximaPagina } from '@/nucleo/consultas';

/**
 * A paginação das listas.
 *
 * Achado de auditoria: `/requests/mine`, `/absences/requests/mine` e `/notifications` têm
 * `page_size` com padrão 20, e o tipo do app era só `{ data: { items } }` — o objeto
 * `pagination` nem entrava. A lista cortava no 21º item **em silêncio**: numa equipe
 * movimentada, uma troca pendente simplesmente não aparecia, e nada na tela sugeria que
 * houvesse mais.
 *
 * As duas funções abaixo são a decisão inteira, e as duas erram de forma silenciosa. Uma URL
 * mal montada vira 400 ou, pior, um parâmetro ignorado que devolve sempre a primeira página.
 * Um `getNextPageParam` errado ou busca para sempre, ou para cedo demais e devolve o mesmo
 * defeito que a mudança veio corrigir.
 */

describe('comPagina — a URL da página seguinte', () => {
  /**
   * Todas as rotas de lista já têm parâmetro (`mine_mode`, `status`, `state`), mas depender
   * disso seria a armadilha de sempre: alguém acrescenta uma rota limpa e o `&page=1` vira
   * parte do caminho, sem erro em lugar nenhum.
   */
  it('usa & quando a rota já tem query string', () => {
    expect(comPagina('/requests/mine?mine_mode=target', 2))
      .toBe('/requests/mine?mine_mode=target&page=2&page_size=50');
  });

  it('usa ? quando a rota está limpa', () => {
    expect(comPagina('/notifications', 1)).toBe('/notifications?page=1&page_size=50');
  });

  it('o número da página é o que foi pedido', () => {
    expect(comPagina('/x', 7)).toContain('page=7');
  });
});

describe('proximaPagina — quando parar de buscar', () => {
  const paginacao = (total_pages: number) => ({
    data: { items: [], pagination: { page: 1, page_size: 50, total: 0, total_pages } },
  });

  it('havendo páginas à frente, pede a seguinte', () => {
    expect(proximaPagina(paginacao(3), [paginacao(3)])).toBe(2);
    expect(proximaPagina(paginacao(3), [paginacao(3), paginacao(3)])).toBe(3);
  });

  /**
   * `undefined` é como o TanStack Query sabe que acabou. Devolver um número aqui faria o app
   * buscar páginas vazias para sempre enquanto a pessoa rolasse.
   */
  it('na última página, para', () => {
    expect(proximaPagina(paginacao(3), [paginacao(3), paginacao(3), paginacao(3)]))
      .toBeUndefined();
  });

  it('com uma página só, nunca busca a segunda', () => {
    expect(proximaPagina(paginacao(1), [paginacao(1)])).toBeUndefined();
  });

  it('lista vazia não vira busca infinita', () => {
    expect(proximaPagina(paginacao(0), [paginacao(0)])).toBeUndefined();
  });

  /**
   * Rota que não pagina — sem `pagination` no envelope — tem uma página só, que é a que
   * veio. É o comportamento antigo, e o certo: buscar `page=2` de algo que não pagina
   * devolveria a mesma lista de novo, repetida na tela.
   */
  it('sem paginação no envelope, a única página é a que veio', () => {
    const semPaginacao = { data: { items: [] } };
    expect(proximaPagina(semPaginacao, [semPaginacao])).toBeUndefined();
  });
});
