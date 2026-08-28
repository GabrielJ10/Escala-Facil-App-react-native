import * as SecureStore from 'expo-secure-store';

/**
 * Guarda o refresh token no cofre do sistema — Keychain no iOS, Keystore no Android.
 *
 * É o equivalente móvel do cookie httpOnly que o site usa: outro app não alcança, e o
 * conteúdo é cifrado em repouso pelo sistema. `AsyncStorage` NÃO serve para isto — é um
 * arquivo em texto claro no diretório do app.
 *
 * O access token continua só em memória, como no site: ele dura 15 minutos e não vale o
 * risco de ser persistido.
 */
const CHAVE_REFRESH = 'escala_facil_refresh_token';

export const armazenamentoSeguro = {
  async lerRefresh(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(CHAVE_REFRESH);
    } catch {
      // Cofre indisponível (aparelho sem bloqueio de tela, em alguns Android antigos):
      // trata como sessão ausente em vez de derrubar o app.
      return null;
    }
  },

  async gravarRefresh(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(CHAVE_REFRESH, token);
    } catch {
      // Falha ao gravar significa que a sessão não sobrevive ao fechamento do app.
      // É degradação, não erro fatal.
    }
  },

  async apagarRefresh(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(CHAVE_REFRESH);
    } catch {
      // ignora
    }
  },
};
