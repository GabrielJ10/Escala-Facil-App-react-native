import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Configuração por ambiente.
 *
 * Os três têm bundle IDs diferentes de propósito: assim ficam instalados lado a lado no
 * mesmo aparelho, e a tarja no nome evita o desperdício clássico — reportar um bug que só
 * existe no ambiente errado.
 */
type Ambiente = 'development' | 'staging' | 'production';

const AMBIENTE = (process.env.APP_ENV || 'development') as Ambiente;

const POR_AMBIENTE: Record<Ambiente, { nome: string; id: string; api: string }> = {
  development: {
    nome: 'Escala Fácil DEV',
    id: 'br.app.escalafacil.dev',
    // Emulador Android não enxerga "localhost" do computador; 10.0.2.2 é o atalho dele.
    api: process.env.API_URL || 'http://10.0.2.2:3333/api/v1',
  },
  staging: {
    nome: 'Escala Fácil STG',
    id: 'br.app.escalafacil.stg',
    api: process.env.API_URL || 'https://dev-api.escalafacil.app.br/api/v1',
  },
  production: {
    nome: 'Escala Fácil',
    id: 'br.app.escalafacil',
    api: process.env.API_URL || 'https://api.escalafacil.app.br/api/v1',
  },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const atual = POR_AMBIENTE[AMBIENTE];

  return {
    ...config,
    name: atual.nome,
    slug: 'escala-facil',
    scheme: 'escalafacil',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',

    ios: {
      bundleIdentifier: atual.id,
      supportsTablet: true,
      // Universal links: o convite do gestor abre no app em vez do navegador.
      associatedDomains: ['applinks:escalafacil.app.br'],
    },

    android: {
      package: atual.id,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: 'escalafacil.app.br' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },

    plugins: ['expo-router', 'expo-secure-store'],

    extra: {
      ambiente: AMBIENTE,
      apiUrl: atual.api,
    },
  };
};
