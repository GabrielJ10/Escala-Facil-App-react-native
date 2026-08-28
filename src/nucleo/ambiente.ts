import Constants from 'expo-constants';

/**
 * O ambiente em que este binário roda — decidido em tempo de build, não de execução.
 *
 * Vem do `app.config.ts`, que lê `APP_ENV`. Ler daqui, e não de `process.env`, é o que
 * garante que o valor sobreviva ao empacotamento: `process.env` não existe no aparelho.
 */
type Ambiente = 'development' | 'staging' | 'production';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  ambiente?: Ambiente;
  apiUrl?: string;
  sentryDsn?: string | null;
};

export const AMBIENTE: Ambiente = extra.ambiente ?? 'development';
export const API_URL: string = extra.apiUrl ?? 'http://10.0.2.2:3333/api/v1';

export const EH_PRODUCAO = AMBIENTE === 'production';

/**
 * Onde os relatórios de erro são entregues, ou nada.
 *
 * Vazio é o estado normal em desenvolvimento, e o módulo de observabilidade trata isso como
 * silêncio, não como falta de configuração: erro de quem está editando código não deve
 * disputar espaço no painel com erro de gente de verdade.
 */
export const SENTRY_DSN: string = extra.sentryDsn ?? '';

/** Versão do app, para o cabeçalho de correlação e para a tela de diagnóstico. */
export const VERSAO_APP: string = Constants.expoConfig?.version ?? '0.0.0';
