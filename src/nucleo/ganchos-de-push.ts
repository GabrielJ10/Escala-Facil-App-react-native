import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { rotaDaNotificacao, ehDestinoDeCobranca, type NotificacaoParaRota } from './rotas-do-push';
import { useSessao } from './sessao';

/**
 * Abrir o app a partir de uma notificação.
 *
 * A ordem é o que faz isto funcionar, e é a ordem que se erra: **restaurar a sessão, depois
 * resolver o destino, depois navegar.** Navegar antes de a sessão voltar leva a pessoa para
 * uma tela protegida que a manda para o login — e depois do login ela cai na tela inicial,
 * não onde o push prometia. O toque some sem deixar rastro de erro.
 *
 * Por isso o gancho espera `carregando` terminar e só age com `autenticado`.
 *
 * Dois caminhos, e os dois precisam existir:
 *
 *   - **app fechado**: o toque já aconteceu antes de este código existir.
 *     `getLastNotificationResponseAsync` recupera esse toque.
 *   - **app aberto ou em segundo plano**: o ouvinte recebe na hora.
 */
export function useNavegacaoPorPush() {
  const { carregando, autenticado } = useSessao();

  // O toque de abertura a frio é entregue toda vez que se pergunta, inclusive depois de já
  // termos navegado. Sem esta trava, voltar para a tela inicial re-navegaria sozinho — o app
  // "puxando" a pessoa para uma tela que ela acabou de deixar.
  const jaTratouAberturaAFrio = useRef(false);

  useEffect(() => {
    if (carregando || !autenticado) return undefined;

    const navegar = (conteudo: NotificacaoParaRota) => {
      const rota = rotaDaNotificacao(conteudo);

      // Cobrança não interrompe quem está com o acesso funcionando. Se a sessão está viva, o
      // aviso de assinatura é informação, não bloqueio — e para o funcionário, que não paga,
      // seria um beco sem saída.
      if (ehDestinoDeCobranca(rota)) return;

      router.push(rota);
    };

    const conteudoDe = (resposta: Notifications.NotificationResponse | null) => {
      const bruto = resposta?.notification?.request?.content;
      if (!bruto) return null;
      return {
        category: (bruto.data as { category?: string } | undefined)?.category ?? null,
        data: (bruto.data ?? null) as Record<string, unknown> | null,
      };
    };

    if (!jaTratouAberturaAFrio.current) {
      jaTratouAberturaAFrio.current = true;
      void Notifications.getLastNotificationResponseAsync().then((resposta) => {
        const conteudo = conteudoDe(resposta);
        if (conteudo) navegar(conteudo);
      });
    }

    const inscricao = Notifications.addNotificationResponseReceivedListener((resposta) => {
      const conteudo = conteudoDe(resposta);
      if (conteudo) navegar(conteudo);
    });

    return () => inscricao.remove();
  }, [carregando, autenticado]);
}
