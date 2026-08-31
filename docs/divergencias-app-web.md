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

O cliente também declara a PLATAFORMA em `X-Client-Platform` (`Platform.OS`), que o site não
manda. O servidor a usa para filtrar campanhas do fundador por sistema — sem ela, um aviso de
"baixe nosso aplicativo" apareceria dentro do próprio aplicativo. Sem o cabeçalho o servidor
assume `web`, que é o que o site sempre recebeu e o que uma versão do app anterior a isto
continua recebendo.

**Descartado:** deixar o servidor deduzir pelo User-Agent. Ele é livre, muda a cada versão de
sistema, e adivinhar plataforma por string é como um filtro passa a errar em silêncio meses
depois — sem ninguém ligar a campanha sumida à atualização do iOS.

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

**Onde:** `app/indisponivel.tsx` · `src/nucleo/apresentacao.ts:42-49` (ramo do 402) ·
`src/nucleo/rotas-do-push.ts` (categoria `BILLING` → `/indisponivel`)
**Site faz:** mostra o estado da cobrança e leva para a tela de assinatura.
**App faz:** tela neutra, sem preço, sem plano e sem link — "indisponível no momento, fale
com o gestor da sua equipe". `app/__tests__/indisponivel.test.tsx` varre a tela renderizada
atrás de preço, plano, pagamento e link externo, para que ninguém a transforme em vitrine
sem o teste reclamar.
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

## Notificações no aparelho — canal, permissão e token

**Onde:** `src/nucleo/push.ts`
**Site faz:** notificação in-app apenas — uma lista que o usuário abre. Não existe permissão
a pedir, nem token a registrar, nem canal a criar.
**App faz:** ramifica por plataforma em dois pontos. Cria o canal `default` no Android antes
do primeiro push, e declara `platform: 'ios' | 'android'` ao registrar o aparelho.
**Por quê:** as duas plataformas divergem no que o sistema exige, e as duas falham em
silêncio se a exigência for ignorada.

No Android, notificação sem canal registrado chega sem som e sem vibração desde o Android 8 —
parece que não chegou. O canal precisa existir *antes* da primeira notificação; criá-lo
depois não corrige as que já passaram.

No iOS, a permissão negada é **definitiva**: o sistema não pergunta de novo e recuperar exige
mandar a pessoa às Configurações, caminho que quase ninguém percorre. Por isso o pedido do
sistema está separado da tela que o explica (`app/avisos.tsx`) e nunca sai na primeira
abertura.

O `platform` vai para o backend porque `target_platforms` (Fase 3.2) permite ao console do
fundador mandar aviso só para um dos dois — útil quando o problema é de uma loja só.

**Descartado:** pedir a permissão na abertura, junto com a restauração da sessão. É o padrão
mais comum e o pior: gasta a única chance do iOS antes de a pessoa ter visto a escala, e a
taxa de recusa em pedido não explicado é alta o bastante para inutilizar o canal.

## Portão de versão — para qual loja mandar

**Onde:** `src/componentes/PortaoDeVersao.tsx`
**Site faz:** não existe. O navegador sempre carrega a versão mais nova; não há binário
antigo instalado em lugar nenhum.
**App faz:** compara a versão do binário com o mínimo do servidor e, se estiver abaixo,
bloqueia com um link para a App Store ou para a Play Store conforme `Platform.OS`.
**Por quê:** o app instalado pode estar semanas atrás do servidor — atualizar é opcional e a
loja demora. Sem portão, uma rota que muda de forma quebra um app antigo sem explicação: a
tela fica vazia, ou pior, mostra dado errado com cara de certo. E as URLs das duas lojas são
diferentes; mandar um usuário de iPhone para a Play Store é um beco sem saída.

Duas decisões que evitam o portão virar o problema:

1. **Falha aberto.** Sem resposta do servidor, com resposta ilegível, ou com a consulta ainda
   em voo, o app renderiza normalmente. Um portão que tranca porque não conseguiu perguntar
   se pode destravar deixaria o app inutilizável durante qualquer queda da API — inclusive
   para quem está na versão mais nova. Coberto por `versao.test.ts`.
2. **`recommended` não bloqueia.** Vira uma faixa na tela de escala. Transformar sugestão em
   obstáculo ensina a pessoa a ignorar o aviso que um dia vai importar.

**Descartado:** bloquear pela versão do `eas update` em vez da versão do binário. O canal de
update entrega JS novo sem passar pela loja, então a versão do bundle não diz se o binário
tem o código nativo de que a API precisa — que é justamente o caso em que bloquear importa.

## Teclado cobrindo o formulário de afastamento

**Onde:** `app/afastamentos.tsx`
**Site faz:** nada — o navegador rola a página sozinho quando o campo ganha foco.
**App faz:** `KeyboardAvoidingView` com `behavior="padding"` no iOS e nada no Android.
**Por quê:** o mesmo motivo de `app/entrar.tsx`, e a mesma correção. O Android já empurra a
tela por conta própria (`adjustResize`); no iOS o teclado cobre o campo. Aplicar `padding`
nos dois faz o Android empurrar duas vezes e o botão sair da tela.
**Descartado:** extrair um componente `TelaComTeclado` para os dois formulários. Com duas
ocorrências de duas linhas, a abstração custaria mais leitura do que economiza. Vale extrair
na terceira.

## Afastamentos — a tela do funcionário, não a do gestor

**Onde:** `app/afastamentos.tsx`
**Site faz:** `AfastamentosPage`, 1.187 linhas: lista todos os afastamentos da organização,
aprova, recusa, cria, edita e apaga. Exige `module_absences`, que é OWNER/ADMIN.
**App faz:** pedir afastamento e acompanhar os próprios pedidos. Só isso.
**Por quê:** o funcionário alcança `action_create_absence_request` e `/absences/requests/mine`
— nada mais. Trazer a tela do gestor para o celular daria uma tela que a maioria dos usuários
do app não tem permissão de abrir.

Há uma segunda diferença, imposta pelo backend: `listRequestsQuerySchema` tem
`.default('PENDING_ADMIN_APPROVAL')`, então não existe "trazer tudo" numa chamada só. Daí os
quatro filtros por situação, que no site seriam uma coluna da tabela.

**Descartado:** buscar as quatro situações em paralelo e juntar no cliente, para imitar a
lista única do site. Seriam quatro requisições por abertura de tela para economizar um toque.

## Solicitações do gestor — leitura, sem aprovação

**Onde:** `app/solicitacoes.tsx`
**Site faz:** aprova e recusa trocas e afastamentos, mostrando o impacto antes de confirmar.
**App faz:** lista o que está parado e diz onde resolver.
**Por quê:** aprovar uma troca exige o fluxo de duas etapas do backend —
`POST /requests/:id/preview-impact` devolve um `preview_hash` que `approveSchema` exige como
obrigatório, e o preview traz os conflitos que o gestor precisa ver antes de decidir: turno
que fica descoberto, carga horária estourada, qualificação faltando. Um botão "aprovar" que
pulasse essa leitura seria pior que não ter botão — decidiria no escuro.

A tela existe agora porque é o destino de `pending_admin_requests` e
`pending_absence_requests` no mapa de rotas do push: sem ela, o toque na notificação abriria
uma rota inexistente, que é exatamente o defeito que o mapa foi feito para evitar.

**Descartado:** deixar o push cair na tela inicial até a Fase 5. Funciona, mas ensina o
usuário que a notificação não leva a lugar nenhum — e essa expectativa não se desfaz quando a
tela chega.

## Confirmação destrutiva — sair da conta

**Onde:** `app/perfil.tsx`
**Site faz:** `window.confirm`, usado em `AfastamentosPage` e em outras ações destrutivas.
**App faz:** `Alert.alert` com os botões nomeados pela ação ("Ficar" / "Sair") e `style:
'destructive'` no que destrói.
**Por quê:** `window.confirm` não existe no React Native. E a substituição não é literal: o
`Alert` nativo permite nomear os botões pelo que eles fazem, em vez de "OK" e "Cancelar" —
que num diálogo negativo ("sair?") deixam ambíguo o que "OK" confirma.
**Descartado:** um modal próprio em JavaScript. O diálogo do sistema já é acessível, já
respeita o tema e o tamanho de fonte do aparelho, e não pode ser coberto por outro elemento.

## Calendário do sistema — a fonte, e o módulo que não escrevemos

**Onde:** `src/nucleo/calendario-do-sistema.ts`, `app/calendario.tsx`
**Site faz:** não existe. O navegador não alcança o calendário do sistema; o mais próximo é
o feed ICS de `/exports/public/schedule/:token`, que é uma assinatura, não uma integração.
**App faz:** cria um calendário dedicado chamado "Escala Fácil" e mantém os turnos dos
próximos 60 dias nele. Ramifica por `Platform.OS` na hora de escolher a **fonte** do
calendário novo.
**Por quê:** é onde as duas plataformas mais divergem, e errar significa criar um calendário
que existe e não aparece.

O iOS exige uma `source` real — a do calendário padrão. Inventar uma faz o `createCalendar`
passar e o evento não aparecer em lugar nenhum. O Android aceita `ACCOUNT_TYPE_LOCAL`, que é
o que mantém os eventos no aparelho em vez de sincronizá-los com uma conta Google que a pessoa
não escolheu compartilhar conosco.

**Desvio do plano, deliberado.** A Fase 7 previa um módulo nativo próprio — Swift com EventKit
e Kotlin com CalendarContract, atrás de uma interface única. Este código usa `expo-calendar`,
que já é exatamente isso, mantido pela Expo e versionado junto com o SDK.

O motivo é a prioridade que foi declarada para este aplicativo: **pouca manutenção.** Um
módulo nativo próprio é o oposto — duas pontes para manter, uma migração a cada versão do
SDK, e um plugin de configuração nosso. O argumento a favor de escrevê-lo era provar que o app
é nativo de verdade para a regra 4.2 da Apple, e esse argumento vale igual aqui: a integração
com o calendário do sistema é a mesma, feita por código nativo, apenas não escrito por nós.

O caminho de volta continua aberto e barato: `calendario.ts` — que decide o que criar,
atualizar e apagar — não sabe que `expo-calendar` existe. Trocar a implementação mexe só
neste arquivo.

**Descartado:** sincronizar em segundo plano. Escrever sozinho no calendário de alguém é o
tipo de comportamento que faz o app ser desinstalado, e um sync automático que erra escreve o
erro em silêncio, num aplicativo que não é o nosso. A sincronização acontece quando a pessoa
toca.

**Descartado também:** usar a agenda pessoal em vez de um calendário separado. Sem separação
não há como oferecer "remover da agenda" com confiança — a limpeza evento por evento deixaria
sobras sempre que o mapeamento estivesse incompleto, e ele pode estar depois de qualquer falha
parcial.

## Comunicados do fundador — sem HTML, e a fila reimplementada

**Onde:** `src/componentes/ComunicadoDoFundador.tsx`, `src/nucleo/campanhas.ts`
**Site faz:** `ModalCampaignHost` + `useReusableModalQueue` + `ReusableModalHost`, cerca de
500 linhas com teste. Renderiza o `content.html` da campanha num iframe com `sandbox`, que é
a segunda camada de defesa sobre a sanitização feita no servidor. Recarrega a lista a cada
dois minutos.
**App faz:** as mesmas regras de fila, reimplementadas em funções puras
(`src/nucleo/campanhas.ts`), apresentação própria em `Modal` nativo, **sem renderizar
`html`**, e sem relógio de recarga.
**Por quê:** três razões separadas, e vale distingui-las.

**O HTML.** React Native não tem iframe. Exibir HTML de campanha exigiria uma `WebView`: mais
uma dependência, sem sandbox equivalente ao do navegador, dentro de um modal, num app
instalado. Uma campanha só com HTML cai no texto padrão — pior que o site nesse caso, e é a
troca consciente: comunicado com formatação vira comunicado simples, em vez de virar
superfície de execução de HTML de terceiros. `campanhas.test.ts` fixa isso, inclusive que o
HTML não vaza para o corpo.

**A recarga.** O site consulta a cada dois minutos. No celular isso é bateria e dado móvel
gastos para descobrir que nada mudou. Um comunicado do fundador não é urgente ao ponto de
justificar um relógio: recarregar na abertura basta.

**A duplicação da fila.** O plano fixou `format.ts` como a única mudança no repositório do
site, então mover a fila para o contrato verificado está fora de escopo. O preço é ter duas
implementações da mesma regra. O que torna isso aceitável é que as regras são poucas, estão
todas num arquivo, e cada uma tem teste que descreve o comportamento — se o site mudar, a
diferença aparece na leitura do teste, não como defeito em produção.

Duas regras seguem idênticas ao site, e os testes existem para elas continuarem assim:
SHOW_ONCE persiste no servidor ao fechar (senão o comunicado único volta a cada abertura, que
é a forma mais rápida de ensinar alguém a fechar sem ler), e SHOW_ALWAYS vale só para a
sessão.

Uma regra é **mais restritiva** que a do site, de propósito: um `cta_path` que o app não
conhece não vira navegação nenhuma — o botão apenas fecha. No push, o desconhecido cai na tela
inicial porque um push sempre precisa abrir em algum lugar; aqui, levar a pessoa a uma tela
sem relação com o comunicado é pior que só fechar. E `cta_path` de cobrança continua indo
para a tela neutra, pela mesma regra 3.1.3(f) que vale para o push.

**Descartado:** `react-native-webview` para manter a paridade do HTML. Resolveria a
formatação e traria de volta exatamente a crítica que motivou escolher React Native em vez de
empacotar o site — uma tela do app que é, na prática, uma página web.

## Diagnóstico — qual identificador de pacote mostrar

**Onde:** `app/diagnostico.tsx`
**Site faz:** não existe. No navegador, "qual versão você está usando" se responde recarregando
a página, e o console do navegador já entrega o resto.
**App faz:** mostra ambiente, versão, identificador do pacote, servidor, estado da sessão,
permissão de avisos e o último erro de API. Ramifica por `Platform.OS` para ler o
`bundleIdentifier` do iOS ou o `package` do Android.
**Por quê:** os três ambientes têm identificadores diferentes de propósito, para ficarem
instalados lado a lado no mesmo aparelho. Saber qual dos três está na frente da pessoa é a
primeira pergunta de qualquer suporte — e o campo tem nome diferente nas duas plataformas.

Duas coisas ficam de fora desta tela por segurança, porque ela nasce para ser copiada e colada
numa conversa: nenhum token inteiro, e nenhum corpo de resposta. Do último erro vão a rota, o
status e o horário; o conteúdo pode carregar nome, e-mail e escala de terceiros.

**Descartado:** mostrar o token de push completo. Ele identifica o aparelho e permite enviar
notificação para ele; num print compartilhado em grupo, isso é mais do que suporte precisa.

## Escala do gestor — lista por dia, não grade

**Onde:** `app/escala.tsx`
**Site faz:** `ShiftMatrix.tsx`, 2.690 linhas: uma grade local × dia com oito colunas, 1080px
de largura mínima, arrastar e soltar para alocar.
**App faz:** uma semana, dia a dia, com as vagas destacadas e um filtro "só vagas".
**Por quê:** num aparelho de 390px caberiam três colunas da grade, e o gestor passaria a
sessão rolando de lado. Mas a razão de fundo não é largura: **a pergunta é outra.** No
computador, o gestor está montando a escala inteira e precisa ver o conjunto. No celular ele
está resolvendo um buraco — "quem cobre sábado?" — e a resposta tem que caber numa tela.

Daí três decisões que a grade não tem: o cabeçalho de cada dia traz a contagem de vagas, o
filtro "só vagas" existe, e a semana é a unidade de navegação (o mês estouraria o teto de 31
dias de `listQuerySchema`).

**Descartado:** a grade com rolagem horizontal. É o caminho óbvio e foi por onde a discussão
começou; o problema é que ela transfere o custo para o usuário sem resolver nada — continua
sendo a mesma densidade de informação, agora atrás de um gesto.

## Alocar alguém — escolher da lista, não arrastar

**Onde:** `app/turno/[id].tsx`
**Site faz:** arrastar o nome da pessoa para a célula da grade.
**App faz:** abrir o turno e escolher da lista, com busca por nome.
**Por quê:** arrastar exige ver origem e destino ao mesmo tempo, e num celular isso não
existe. A operação é a mesma (`PATCH /shifts/:id/assign`); muda como se chega até ela.

Duas coisas que a tela herda do site de propósito: a ordenação usa `ordenarNomes` do contrato
(um `sort()` cru colocaria "Ávila" depois de "Zanetti"), e desalocar pede confirmação, porque
o turno volta a ser vaga sem avisar ninguém.

O turno vem do cache da semana, não de uma rota própria — `GET /shifts/:id` não existe no
backend.

**Descartado:** trazer o arrastar para o app já nesta fase. O plano tem um portão para isso
(Portão A), que exige um Android real de entrada e ainda não foi respondido. Construir a tela
de gesto antes da medição seria apostar o cronograma numa suposição.

## Criar turno avulso — teclado, e o horário vem do modelo

**Onde:** `app/turno-avulso.tsx`
**Site faz:** o gestor cria turnos aplicando regras de cobertura, ou pontualmente pela grade.
**App faz:** escolhe dia, local e modelo. O horário sai do modelo (`start_time` e
`duration_minutes`), e a tela mostra o que vai ser criado antes de criar.
**Por quê:** duas razões separadas.

Sobre o **teclado**, ramifica por plataforma pelo mesmo motivo de `app/entrar.tsx`: o Android
já empurra a tela sozinho (`adjustResize`), o iOS não. Aplicar `padding` nos dois faz o
Android empurrar duas vezes.

Sobre o **horário**, deixar o gestor digitar hora e duração livres criaria turnos que não
batem com modelo nenhum — e a escala inteira do produto é montada sobre modelos. Escolher o
modelo É escolher o horário.

O instante é construído com `instanteNaOrganizacao`, no fuso da organização. O caminho
ingênuo (`new Date('2026-09-01T08:00')`) usaria o fuso do APARELHO: um gestor viajando criaria
turnos horas fora do que viu na tela, e a diferença só apareceria para quem fosse trabalhar.

**Descartado:** seletor de data e hora nativo. É melhor de usar, e é a próxima melhoria; para
esta versão significaria mais uma dependência com comportamento diferente nas duas
plataformas, enquanto a validação por texto já existe e tem teste.
