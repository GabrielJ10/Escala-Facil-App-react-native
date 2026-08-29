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

    /**
     * A conta dona do projeto no Expo.
     *
     * É uma organização, e não a conta pessoal de quem builda. Sem este campo o Expo
     * "assume o usuário atual" — o que funciona para quem criou o projeto e falha para
     * qualquer outra pessoa do time, com um erro que não explica o motivo.
     */
    owner: 'escalafacils-team',
    scheme: 'escalafacil',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',

    // Sem esta chave o build sai com o ícone padrão do Expo — o arquivo já estava em
    // `assets/` e nada apontava para ele. A tela de abertura fica no plugin, abaixo.
    icon: './assets/icon.png',

    ios: {
      bundleIdentifier: atual.id,
      supportsTablet: true,
      // Universal links: o convite do gestor abre no app em vez do navegador.
      associatedDomains: ['applinks:escalafacil.app.br'],
    },

    android: {
      package: atual.id,
      // O Android 13+ usa as três camadas: fundo, frente e a monocromática do tema dinâmico.
      adaptiveIcon: {
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
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
      /**
       * A tela de abertura. No SDK 57 ela é plugin, e não mais a chave `splash` de topo.
       *
       * O fundo claro nos dois temas é deliberado: a marca é a mesma do site, e o ícone de
       * abertura é desenhado para fundo claro — inverter no escuro deixaria o logo sumido.
       */
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          resizeMode: 'contain',
          backgroundColor: '#FFFFFF',
          imageWidth: 200,
        },
      ],
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

      /**
       * O vínculo com o projeto na conta Expo.
       *
       * Quando o config é um arquivo `.json`, o `eas init` grava este id sozinho. Como aqui
       * ele é TypeScript — precisa ser, para os três ambientes existirem —, o EAS não tem
       * como reescrevê-lo e apenas imprime o id pedindo que alguém o coloque à mão.
       *
       * Por isso ele vem do ambiente: rode `npx eas-cli init`, copie o id que aparecer e
       * ponha em `EAS_PROJECT_ID` no `.env` (ou passe na hora do build). Assim o valor não
       * fica escrito no repositório e cada pessoa aponta para o projeto que usa.
       */
      eas: process.env.EAS_PROJECT_ID
        ? { projectId: process.env.EAS_PROJECT_ID }
        : undefined,
    },
  };
};
