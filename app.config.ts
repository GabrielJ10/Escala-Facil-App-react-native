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
       * Quais arquiteturas de CPU entram no binário.
       *
       * O primeiro APK deste projeto saiu com 101 MB, e 75 deles eram bibliotecas nativas —
       * o mesmo código compilado quatro vezes, uma por arquitetura. Medido no artefato:
       *
       *     x86          20,9 MB    só emulador
       *     x86_64       20,5 MB    só emulador
       *     arm64-v8a    20,1 MB    todo celular moderno
       *     armeabi-v7a  13,8 MB    celulares até ~2014
       *
       * Ou seja: 41 MB de um APK feito para instalar num celular eram para arquiteturas que
       * celular nenhum usa.
       *
       * A lista vem do perfil (`ANDROID_ARCHS` no eas.json) e não daqui, porque a resposta
       * certa muda com o formato. **No AAB da loja o padrão é o certo**: a Play divide o
       * pacote por aparelho, cada pessoa baixa só a sua arquitetura, e incluir x86_64 é o que
       * permite instalar em Chromebook sem custar um byte a mais para quem está no celular.
       * O desperdício só existe no APK universal, que carrega tudo junto.
       */
      [
        'expo-build-properties',
        {
          android: {
            buildArchs: process.env.ANDROID_ARCHS
              ? process.env.ANDROID_ARCHS.split(',').map((a) => a.trim()).filter(Boolean)
              : ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'],
          },
        },
      ],
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

      /**
       * O plugin do Sentry existe para uma coisa só: subir o mapa de fontes durante o
       * `eas build`. Sem ele o painel mostra pilha empacotada, que não aponta linha nenhuma.
       *
       * **O que estava escrito aqui antes era falso**, e um build inteiro morreu provando:
       * dizia que, sem `org` e `project`, o plugin não subia nada e o build seguia. Não é o
       * que acontece. A tarefa de Gradle é ligada de qualquer jeito e falha com "An
       * organization ID or slug is required", derrubando o build aos cinco minutos de fila.
       *
       * Duas coisas mudaram por causa disso. As chaves só entram quando as variáveis existem
       * — o plugin usa `hasOwnProperty`, então `organization: undefined` conta como
       * configurado e ele nem avisa. E quem de fato desliga o upload é
       * `SENTRY_DISABLE_AUTO_UPLOAD=true`, definido por perfil no `eas.json`: ligado nos
       * builds de teste, desligado no de loja, onde faltar mapa de fontes é problema de
       * verdade.
       */
      [
        '@sentry/react-native/expo',
        {
          ...(process.env.SENTRY_ORG ? { organization: process.env.SENTRY_ORG } : {}),
          ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
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
       * Fica escrito aqui, e não só no `.env`, por uma razão descoberta na prática: o
       * `eas-cli` avalia este arquivo SEM carregar o `.env`. O `npx expo config` carrega, o
       * que torna a diferença especialmente traiçoeira — dá para conferir a configuração,
       * ver o id resolvido, e ainda assim o build falhar com "EAS project not configured".
       *
       * Não é segredo: o id aparece na URL do projeto e a própria documentação do Expo manda
       * colocá-lo no app config. O `.env` continua valendo como sobrescrita, para quem
       * precise apontar para outro projeto sem editar arquivo versionado.
       */
      eas: {
        projectId: process.env.EAS_PROJECT_ID || '1f619ab9-5bea-4e57-a318-c43753da8f79',
      },
    },
  };
};
