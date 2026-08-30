import { onlineManager } from '@tanstack/react-query';

/**
 * Se há rede, e o que o aplicativo faz quando não há.
 *
 * O plano promete "leitura em cache; ação exige conexão", e um dos seis fluxos que não podem
 * quebrar é exatamente este: sem sinal, a escala já carregada continua visível, e tentar uma
 * ação recebe recusa clara.
 *
 * Sem este módulo, nada disso acontecia. O TanStack Query não sabia que estava offline, então
 * disparava a requisição, esperava o `fetch` estourar por conta própria e mostrava erro
 * genérico — depois de alguns segundos de espera, sem nunca dizer "você está sem internet".
 * A diferença entre isso e uma recusa imediata não é estética: quem toca em "aceitar troca" e
 * vê a tela pensar não sabe se o pedido foi enviado.
 *
 * ## Por que `isInternetReachable` e não `isConnected`
 *
 * `isConnected` diz que existe uma interface ativa — o wi-fi do café ao qual você se conectou
 * mas cujo portal de login ainda não abriu responde `true` aqui. `isInternetReachable` é o
 * que responde à pergunta que interessa: dá para falar com o servidor?
 *
 * O campo pode vir `null` enquanto o sistema ainda não decidiu. Nesse caso a resposta é
 * **online**, e é uma escolha: tratar "não sei" como offline bloquearia ações legítimas nos
 * primeiros instantes depois de abrir o app, que é justamente quando as pessoas agem.
 * Errar para o lado de tentar é barato — a requisição falha e o erro de rede já é tratado.
 * Errar para o lado de bloquear é uma recusa que a pessoa não entende.
 *
 * Este módulo é puro de propósito, seguindo o mesmo corte de `calendario.ts`: a decisão fica
 * aqui e tem teste, e quem fala com o sistema é `rede-do-sistema.ts`. O motivo é concreto —
 * importar `expo-network` puxa o `react-native`, que é escrito em Flow e o Vitest não
 * analisa. A regra ficaria sem teste por causa de um detalhe de empacotamento.
 */

/** O que o resto do app pergunta. */
export function estaOnline(): boolean {
  return onlineManager.isOnline();
}

/**
 * O que `expo-network` informa, na parte que interessa.
 *
 * Declarado aqui em vez de importado do pacote justamente para este módulo não depender dele
 * — é o que mantém a regra abaixo testável.
 */
export type EstadoDaRede = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

/**
 * Traduz o estado do sistema para a única pergunta que importa.
 *
 * Exportada para teste: é a regra de decisão, e é onde um erro passaria despercebido.
 */
export function temInternet(estado: EstadoDaRede | null | undefined): boolean {
  if (!estado) return true;
  if (estado.isConnected === false) return false;
  // `null` ou `undefined` significam "o sistema ainda não sabe" — ver a nota acima.
  return estado.isInternetReachable !== false;
}

/**
 * O erro de uma ação recusada por falta de rede.
 *
 * Status 0 de propósito, e não ausência de status: distingue "recusamos antes de tentar" de
 * "o servidor não respondeu" na tela de diagnóstico, onde essa diferença é a primeira coisa
 * que alguém quer saber. Para quem lê a mensagem as duas são a mesma situação, e
 * `mensagemDeErro` trata as duas como falha de rede.
 */
export function erroSemRede(): Error & { status?: number } {
  const erro = new Error('Sem conexão. Esta ação precisa de internet.') as Error & { status?: number };
  erro.status = 0;
  return erro;
}
