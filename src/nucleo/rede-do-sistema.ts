import { onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';

import { temInternet } from './rede';

/**
 * A casca que fala com o sistema operacional sobre rede.
 *
 * Fina de propósito: tudo que decide está em `rede.ts`, que é puro e tem teste. Aqui só
 * existe a assinatura do evento e a tradução para o `onlineManager`.
 *
 * O corte não é estético. `expo-network` puxa o `react-native`, escrito em Flow, que o
 * Vitest não consegue analisar — com a regra neste arquivo, ela ficaria sem teste por causa
 * de um detalhe de empacotamento.
 */

/**
 * Liga o estado da rede ao TanStack Query, e devolve como desligar.
 *
 * Chamado uma vez, no arranque. O `onlineManager` é global por desenho da biblioteca: com
 * ele alimentado, consultas pausam em vez de falhar e voltam sozinhas quando a rede volta —
 * sem nenhuma tela precisar saber disso.
 */
export function observarRede(): () => void {
  // O estado inicial é assíncrono; até ele chegar vale o padrão do `onlineManager` (online),
  // pelo mesmo motivo pelo qual o indefinido conta como online em `temInternet`.
  void getNetworkStateAsync()
    .then((estado) => onlineManager.setOnline(temInternet(estado)))
    .catch(() => onlineManager.setOnline(true));

  const inscricao = addNetworkStateListener((estado) => {
    onlineManager.setOnline(temInternet(estado));
  });

  return () => inscricao.remove();
}
