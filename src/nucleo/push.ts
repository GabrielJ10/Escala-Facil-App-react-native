import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

import { apiFetch } from './api';
import { VERSAO_APP } from './ambiente';

/**
 * Registro do aparelho para notificações.
 *
 * A parte difícil aqui não é técnica, é de sequência. **No iOS, a permissão negada é
 * definitiva**: o sistema não pergunta de novo, e recuperar exige mandar a pessoa às
 * Configurações — um caminho que quase ninguém percorre. Então o pedido do sistema só pode
 * sair depois que a pessoa já entendeu para quê, e nunca na primeira abertura, quando ela
 * ainda não viu nada do produto.
 *
 * Por isso este módulo separa três coisas que costumam vir grudadas:
 *
 *   - `situacaoDaPermissao()` — o que já foi decidido, sem perguntar nada;
 *   - `pedirPermissao()` — o pedido do sistema, chamado só pela tela que explicou antes;
 *   - `registrarAparelho()` — o cadastro no servidor, que só faz sentido com permissão.
 *
 * A rota `POST /users/me/devices` fica ANTES do portão de cobrança no backend de propósito:
 * o funcionário precisa registrar o aparelho mesmo com a assinatura do gestor suspensa, para
 * poder ser avisado quando o acesso voltar.
 */

export type SituacaoDaPermissao = 'concedida' | 'negada' | 'nao-perguntada';

export async function situacaoDaPermissao(): Promise<SituacaoDaPermissao> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'concedida';
  if (status === 'undetermined' || canAskAgain) return 'nao-perguntada';
  return 'negada';
}

/** O pedido do sistema. Só chamar depois de explicar — no iOS não há segunda chance. */
export async function pedirPermissao(): Promise<SituacaoDaPermissao> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted' ? 'concedida' : 'negada';
}

/**
 * O `projectId` do EAS, que o `getExpoPushTokenAsync` exige.
 *
 * Sem ele a chamada falha em build de produção com um erro pouco óbvio — funciona no Expo Go
 * e quebra depois, que é o pior momento para descobrir.
 */
function idDoProjeto(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export type ResultadoDoRegistro =
  | { ok: true; token: string }
  | { ok: false; motivo: 'sem-permissao' | 'sem-aparelho' | 'falhou' };

/**
 * Pega o token do Expo e registra no servidor.
 *
 * Nunca lança: falhar em registrar push não pode impedir alguém de ver a própria escala.
 * O motivo volta no retorno para a tela de diagnóstico poder mostrá-lo.
 */
export async function registrarAparelho(): Promise<ResultadoDoRegistro> {
  // Emulador não recebe push. Tentar mesmo assim gera um erro confuso que parece defeito.
  if (!Device.isDevice) return { ok: false, motivo: 'sem-aparelho' };

  if (await situacaoDaPermissao() !== 'concedida') {
    return { ok: false, motivo: 'sem-permissao' };
  }

  try {
    // O canal do Android precisa existir ANTES do primeiro push, senão a notificação chega
    // sem som e sem vibração — e parece que não chegou.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos da escala',
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: idDoProjeto(),
    });

    await apiFetch('/users/me/devices', {
      method: 'POST',
      body: JSON.stringify({
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        app_version: VERSAO_APP,
      }),
    });

    return { ok: true, token };
  } catch {
    return { ok: false, motivo: 'falhou' };
  }
}

/**
 * Como a notificação se comporta com o app aberto.
 *
 * O padrão do Expo é engolir a notificação em primeiro plano. Para um app de escala isso é
 * errado: o aviso mais urgente — "seu turno de amanhã mudou" — costuma chegar justamente com
 * a pessoa olhando a escala.
 */
export function configurarApresentacao() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
