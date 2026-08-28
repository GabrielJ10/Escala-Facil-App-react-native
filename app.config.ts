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
    //
    // HTTP sem TLS aqui é deliberado e só alcança este ambiente: o destino é a máquina do
    // desenvolvedor, na rede dele. Staging e produção são HTTPS, e o Android bloqueia
    // tráfego em claro por padrão em build de release — então isto não vaza para a loja.
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

    /**
     * Os plugins que precisam de build nativo.
     *
     * Estes textos são o que a pessoa lê no diálogo do sistema, e no iOS eles também são
     * lidos pelo revisor da App Store: um texto genérico ("o app precisa de acesso") é
     * motivo de rejeição. Cada um diz o QUE o app faz com a permissão, não que ele a quer.
     *
     * Mexer nesta lista exige `eas build` e passar pela loja — não sai por `eas update`.
     */
    plugins: [
      'expo-router',
      'expo-secure-store',
      /**
       * O plugin do Sentry existe para uma coisa só: subir o mapa de fontes durante o
       * `eas build`. Sem ele o painel mostra pilha empacotada, que não aponta linha nenhuma.
       *
       * `org` e `project` saem do ambiente do build. Ausentes, o plugin não sobe nada e o
       * build segue — que é o comportamento certo para quem clona o repositório e só quer
       * rodar o app.
       */
      [
        '@sentry/react-native/expo',
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
        },
      ],
      [
        'expo-calendar',
        {
          calendarPermission:
            'Para colocar seus turnos na agenda do celular, num calendário separado que você '
            + 'pode remover quando quiser.',
        },
      ],
      [
        'expo-notifications',
        {
          // O canal e o ícone do Android. Sem ícone monocromático, o Android desenha um
          // quadrado branco na barra de status.
          color: '#2E4BD8',
        },
      ],
    ],

    extra: {
      ambiente: AMBIENTE,
      apiUrl: atual.api,
      // Só o DSN atravessa para o aparelho — o token de upload do mapa de fontes fica no
      // ambiente do build e nunca entra no pacote.
      sentryDsn: process.env.SENTRY_DSN || null,
    },
  };
};
