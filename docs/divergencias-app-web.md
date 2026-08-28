# Divergências entre o aplicativo e o site

Toda diferença de comportamento entre os dois clientes tem entrada aqui, com o motivo e a
alternativa descartada. Não é documentação opcional: `npm run check:divergencias` varre o
código atrás de `Platform.OS`, `Platform.select` e arquivos `.ios.tsx` / `.android.tsx`, e
falha se o caminho não estiver citado neste arquivo.

A regra existe porque divergência sem motivo escrito vira, meses depois, "por que isso é
diferente aqui?" — e ninguém lembra.

---

## Cliente HTTP — onde mora o refresh token

**Onde:** `src/nucleo/api.ts`
**Site faz:** guarda o refresh em cookie httpOnly; o servidor o define e o navegador o
devolve sozinho. O corpo da resposta traz só o `accessToken`.
**App faz:** guarda no Keychain (iOS) / Keystore (Android) via `expo-secure-store`, e manda
o token no corpo com o cabeçalho `X-Client-Type: mobile`.
**Por quê:** o aplicativo não tem cookie httpOnly. O cofre do sistema é o equivalente dele —
outro app não alcança e o conteúdo é cifrado em repouso. Cookie httpOnly continua sendo o
lugar certo no navegador, onde protege contra XSS.
**Descartado:** `AsyncStorage` — é arquivo em texto claro no diretório do app; qualquer
backup ou aparelho com root expõe a sessão.

## Cliente HTTP — o que acontece quando a sessão acaba

**Onde:** `src/nucleo/api.ts`
**Site faz:** `window.location.href = '/login'`.
**App faz:** chama um callback registrado pela navegação (`registrarSaidaPorSessao`).
**Por quê:** `window.location` não existe no React Native, e o cliente HTTP não deve
conhecer rotas — quem navega é a navegação.

## Formatação — de onde vem o `Intl`

**Onde:** `src/nucleo/intl.ts` (carregado em `app/_layout.tsx`)
**Site faz:** usa o `Intl` do navegador direto; o ICU é completo.
**App faz:** carrega `@formatjs` como polyfill antes de qualquer formatação.
**Por quê:** o Hermes no Android vem com ICU parcial, e a falha é silenciosa: `pt-BR` cai
para `en-US`, data vira "3/16/2026" e moeda vira "$". Nada quebra — só fica errado.
**Descartado:** confiar no ICU do Expo. Pode bastar hoje e deixar de bastar numa atualização,
e o `check:contract` fica verde enquanto o app calcula o dia errado.

## Tema — como os tokens chegam ao componente

**Onde:** `src/nucleo/tema.ts`
**Site faz:** variáveis CSS em `:root`, consumidas pelo Tailwind.
**App faz:** objeto TypeScript com os mesmos valores em hexadecimal.
**Por quê:** não há CSS no React Native. Os valores são os mesmos; muda a representação.
**Descartado:** NativeWind — outra dependência e outra camada de build para resolver algo
que um objeto resolve.

## Cobrança — o que o app mostra quando a assinatura está inadimplente

**Onde:** a definir (Fase 3.7)
**Site faz:** mostra o estado da cobrança e leva para a tela de assinatura.
**App faz:** tela neutra, sem preço, sem plano e sem link — "indisponível no momento, fale
com o gestor da sua equipe".
**Por quê:** a regra 3.1.3(f) da Apple permite o app gratuito companheiro de uma ferramenta
web paga desde que não haja compra dentro do app **nem chamada para comprar fora**. Um
paywall no app é a rejeição mais provável. E o funcionário não é quem paga: mostrar cobrança
para ele é ruído, não ação.

## Teclado cobrindo o formulário de entrada

**Onde:** `app/entrar.tsx`
**Site faz:** nada — o navegador rola a página sozinho quando o campo ganha foco.
**App faz:** `KeyboardAvoidingView` com `behavior="padding"` no iOS e nada no Android.
**Por quê:** os dois sistemas tratam o teclado de formas opostas. O Android já empurra a
tela por conta própria (`adjustResize`); no iOS o teclado cobre o campo e o app precisa
reagir. Aplicar `padding` nos dois faz o Android empurrar duas vezes e o botão sair da tela.
**Descartado:** biblioteca de teclado (`react-native-keyboard-aware-scroll-view`) — mais uma
dependência para resolver duas linhas.

## Destino da notificação — o mapa de rotas

**Onde:** `src/nucleo/rotas-do-push.ts`
**Site faz:** `resolveNotificationTargetPath` em `notificationTypes.ts` devolve o próprio
caminho (`/dashboard/trocas`), porque o site É essa árvore de rotas. Usa
`window.location.origin` para descartar links externos.
**App faz:** traduz o caminho do site para a rota do app, e o que não conhece cai na tela
inicial em vez de devolver nulo.
**Por quê:** o backend guarda o destino como caminho do site — foi ele quem existiu primeiro.
O app tem outra árvore de navegação. Sem tradução, notificação de uma versão mais nova do
servidor abre nada num app antigo: o usuário toca, cai na tela inicial, e ninguém reporta,
porque não houve erro.

Duas regras que o site não precisa ter:

1. **Caminho desconhecido nunca é erro.** O servidor ganha destinos a cada deploy e o app
   instalado não sabe deles. Abrir na tela errada é ruim; não abrir é pior.
2. **Cobrança vai para a tela neutra.** Oito `target_path` do backend apontam para
   `/dashboard/settings?tab=billing`. Um push de "sua assinatura venceu" abrindo tela de
   preço dentro do app é o que a regra 3.1.3(f) da Apple reprova — e é ruído para o
   funcionário, que não é quem paga.

**Descartado:** reusar `resolveNotificationTargetPath` do contrato compartilhado. Ele
depende de `window.location.origin`, e o resultado dele (um caminho do site) não serve para
navegar aqui.
