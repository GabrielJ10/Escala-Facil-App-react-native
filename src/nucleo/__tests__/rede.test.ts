import { describe, expect, it } from 'vitest';

import { temInternet } from '@/nucleo/rede';

/**
 * A regra que decide se o aplicativo se considera online.
 *
 * Duas linhas de código e cinco maneiras de estar errada — e nenhuma delas falha de forma
 * visível. Errar para o lado de "offline" bloqueia ação legítima com uma recusa que a pessoa
 * não entende; errar para o lado de "online" devolve a espera de alguns segundos e o erro
 * genérico que este módulo existe para eliminar.
 *
 * Por isso os casos são a tabela inteira das combinações possíveis, e não uma amostra.
 */
describe('temInternet', () => {
  it('conectado e com internet alcançável: online', () => {
    expect(temInternet({ isConnected: true, isInternetReachable: true })).toBe(true);
  });

  /**
   * O caso que justifica olhar `isInternetReachable` em vez de parar em `isConnected`.
   *
   * O wi-fi do café ao qual você se conectou, mas cujo portal de login ainda não abriu,
   * responde `isConnected: true` — e nenhuma requisição funciona. Parar na primeira
   * pergunta faria o app tentar, esperar e falhar, exatamente como antes.
   */
  it('conectado mas sem internet — o wi-fi com portal de login — é offline', () => {
    expect(temInternet({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('desconectado é offline, independente do resto', () => {
    expect(temInternet({ isConnected: false, isInternetReachable: false })).toBe(false);
    expect(temInternet({ isConnected: false, isInternetReachable: true })).toBe(false);
  });

  /**
   * "Ainda não sei" vale como online, e é decisão, não descuido.
   *
   * O sistema leva um instante para resolver a alcançabilidade, e esse instante é logo depois
   * de abrir o app — que é justamente quando as pessoas agem. Tratar o indefinido como
   * offline bloquearia ação legítima; tratá-lo como online no máximo devolve o
   * comportamento antigo, que já tem tratamento.
   */
  it('estado indefinido conta como online, para não bloquear quem acabou de abrir o app', () => {
    expect(temInternet({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(temInternet({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(temInternet(null)).toBe(true);
  });

  /**
   * `isConnected` indefinido com alcançabilidade negada continua offline: a resposta mais
   * específica ganha da mais vaga.
   */
  it('alcançabilidade negada vence a conexão indefinida', () => {
    expect(temInternet({ isConnected: null, isInternetReachable: false })).toBe(false);
  });
});
