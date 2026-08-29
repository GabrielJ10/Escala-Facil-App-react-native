# Changelog

Segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
[SemVer](https://semver.org/lang/pt-BR/), com **duas seções a mais** em cada versão:

- **Exige build nativo?** — a primeira linha que interessa a quem lê isto na madrugada: a
  correção sai por `eas update` em minutos, ou espera a revisão da loja?
- **Divergências introduzidas** — o que passou a se comportar diferente do site, e onde está
  escrito o porquê.

---

## [Não publicado]

### Exige build nativo?

**Sim.** Quatro dependências nativas entraram: `expo-notifications` e `expo-device`
(permissão do sistema, canal de notificação no Android, entitlement de push no iOS),
`expo-calendar` (acesso ao calendário, com `NSCalendarsUsageDescription` no iOS e
READ/WRITE_CALENDAR no Android) e `@sentry/react-native` (o mapa de fontes é enviado
**durante o build**, não depois). Nada disso alcança um aparelho por `eas update` — precisa
de `eas build` e passar pela loja.

Os textos de permissão ficam em `app.config.ts`. No iOS eles são lidos pelo revisor da App
Store: texto genérico é motivo de rejeição, então cada um diz o que o app faz com a
permissão, não que ele a quer.

Depois deste build, as telas e a lógica desta versão saem por `eas update` normalmente.

### Divergências introduzidas

Doze entradas novas em [`docs/divergencias-app-web.md`](docs/divergencias-app-web.md):

| Onde | Diferença |
|---|---|
| `src/nucleo/push.ts` | Canal do Android e `platform` no registro. Não existe no site |
| `src/componentes/PortaoDeVersao.tsx` | Loja por plataforma; falha aberto |
| `app/afastamentos.tsx` | Teclado por plataforma; tela de *pedir*, não a de gestor |
| `app/solicitacoes.tsx` | Leitura sem aprovação — aprovar exige o `preview_hash` |
| `app/perfil.tsx` | `Alert.alert` no lugar do `window.confirm` |
| `app/avisos.tsx` | Não existe no site: no navegador não há permissão de push a queimar |
| `app/diagnostico.tsx` | Identificador do pacote por plataforma; sem token inteiro |
| `app/escala.tsx` | Lista por dia com vagas na frente, no lugar da grade de 2.690 linhas |
| `app/turno/[id].tsx` | Alocar escolhendo da lista, no lugar de arrastar |
| `app/turno-avulso.tsx` | Teclado por plataforma; horário vem do modelo, não digitado |
| `src/componentes/ComunicadoDoFundador.tsx` | Sem HTML da campanha, sem relógio de recarga |
| `src/nucleo/calendario-do-sistema.ts` | Fonte do calendário por plataforma; `expo-calendar` no lugar de módulo próprio |

### Adicionado

- **`npm run build` — um handler para gerar builds com parâmetros.** O `eas build` sozinho
  já monta o app; o script existe pelo que ele não faz, que é avisar quando o que você pediu
  não é o que você quer. Uma build de Android leva de 10 a 40 minutos na fila gratuita, e as
  três formas mais comuns de perder esse tempo são silenciosas:

  1. **AAB não instala no celular.** É o padrão do EAS para Android e só a Play Store abre.
     Você espera a fila, baixa, e descobre no aparelho.
  2. **A API do perfil pode não existir.** O `staging` aponta para `dev-api.escalafacil.app.br`,
     que hoje não resolve no DNS — o app instala, abre e falha em toda requisição.
  3. **`development` aponta para `10.0.2.2`**, apelido do emulador para o localhost da
     máquina. Num celular de verdade não significa nada.

  As três viram aviso ANTES da build começar. Junto com elas, a conferência de login e, com
  `--local`, a de Java instalado.

  O script não repete o mapeamento de ambiente: pergunta ao `expo config`, que lê o
  `app.config.ts`. Nome, bundle ID e URL da API mostrados são exatamente os que vão para
  dentro do binário, e mexer no config não deixa o script mentindo.

  `--simular` roda tudo e mostra o comando sem construir. Atalhos: `build:apk` e `build:loja`.

- **ESLint passou a cobrir `scripts/*.mjs`.** Descoberto do jeito ruim: o `build.mjs` nasceu
  com complexidade cognitiva 25 — dez acima do teto que a própria config declara como erro —
  e nada acusou, porque os blocos só casavam `.ts` e `.tsx`. Quem avisou foi o SonarLint da
  IDE, ou seja, a CI teria deixado passar.

- **ESLint neste repositório, que não tinha nenhum.** O backend tem ESLint com SonarJS, o
  site tem as regras de hook — este repo não tinha nada, e é o que mais precisa das duas
  coisas: quase toda tela aqui é composição de hooks, e um array de dependências errado num
  app não vira aviso no console de ninguém. Vira bateria consumida em segundo plano, ou uma
  tela que não atualiza e que ninguém consegue reproduzir.

  As regras de hook entram como **erro**, não aviso: no site elas eram aviso e conviveram com
  seis pendências, uma das quais fazia um efeito rodar em todo render. Aqui ainda não há
  dívida para acomodar. `npm run lint` entrou no `verificar` e na CI, entre o typecheck e o
  contrato.

  A primeira passada achou três coisas, e nenhuma era estilo:

  1. `app/_layout.tsx` renderizava `null` no primeiro render, atrás de um
     `useState`+`useEffect` sem comentário nenhum. Não estabelecia ordem: `Navegacao` e
     `Stack` montam juntos com ou sem ele. Removido — um render a menos na abertura a frio,
     que é justamente o orçamento mais apertado do plano.
  2. `app/claim-invite.tsx` — exceção analisada e registrada no código: a escrita no servidor
     é o caso que a própria mensagem da regra descreve como aquilo para que efeitos existem.
  3. `presentWarning` estava com complexidade cognitiva 23 — e, ao medir o que um refactor
     quebraria, **metade dos ramos não tinha teste nenhum**. Onze casos de caracterização
     foram escritos contra o código como ele era, e só então a função virou duas tabelas de
     despacho. A ordem de avaliação foi preservada e agora está fixada por teste: um aviso de
     feriado que também traga `overlap_minutes` continua saindo como feriado.

- **`src/nucleo/observabilidade.ts`** — relatório de erro por Sentry, com duas regras que
  valem mais que o próprio relatório:

  **Sem DSN, silêncio.** `SENTRY_DSN` chega por variável de ambiente no build. Ausente — o
  caso normal em desenvolvimento — nada é inicializado e nada é enviado, em vez de falhar
  pedindo configuração. Erro de quem está editando código não disputa espaço no painel com
  erro de gente de verdade.

  **Nada sobre a pessoa.** Este app carrega escala, nome, cargo e e-mail de funcionário.
  `sendDefaultPii` fica desligado, a identificação é o id do membro e mais nada, e as
  migalhas passam por uma peneira que descarta corpo de requisição, resposta, cabeçalho de
  autenticação, e — em produção — console e **toque**: `Sentry.wrap` registra o rótulo de
  acessibilidade do elemento tocado, e aqui esse rótulo costuma ser o nome de alguém.

  O teste que mais importa não é nenhum dos quinze isolados, e sim o que verifica que a
  peneira está **ligada** no `init`: sem ele, trocar `beforeBreadcrumb` por `undefined`
  passaria em tudo enquanto o corpo de cada requisição voltava a sair do aparelho.

  A tela de diagnóstico ganhou a linha "Relatório de erro", para quem atende o suporte saber
  se vale procurar no painel ou se o relato da pessoa é a única fonte que existe.

- **Telas do funcionário** — `trocas`, `afastamentos`, `notificacoes`, `perfil`, e a
  `minha-escala` reescrita sobre a camada compartilhada de consultas.
- **`app/avisos.tsx`** — a tela que explica o push antes de pedir a permissão do sistema. No
  iOS a recusa é definitiva; pedir na primeira abertura queima a única chance.
- **`app/indisponivel.tsx`** — a tela neutra de acesso suspenso. Sem preço, plano ou link,
  pela regra 3.1.3(f) da Apple.
- **`app/claim-invite.tsx`** — resgate do convite por universal link / app link. O nome do
  arquivo espelha a rota do site e não pode mudar: os convites já enviados apontam para ele.
- **`app/solicitacoes.tsx`** — a fila do gestor, em leitura. Existe para o push de
  `pending_admin_requests` ter onde aterrissar.
- **`src/nucleo/apresentacao.ts`** — as decisões de tela em funções puras: texto de erro,
  rótulos, `podeResponderTroca`, validação do pedido de afastamento, agrupamento por dia.
- **`src/nucleo/versao.ts`** e **`src/componentes/PortaoDeVersao.tsx`** — o portão de versão,
  que falha aberto.
- **`src/nucleo/push.ts`** e **`src/nucleo/ganchos-de-push.ts`** — permissão, registro do
  aparelho e abertura na tela certa (a frio e em segundo plano).
- **`scripts/check-docs.mjs`** — exige `README.md` com quatro seções preenchidas em cada
  módulo. Entrou no `npm run verificar`.
- **Telas do gestor** — `escala` (a semana dia a dia, com filtro de vagas), `turno/[id]`
  (alocar e desalocar) e `turno-avulso` (criar turno pontual, a mesma primitiva do plano
  MANUAL).
- **`src/nucleo/escala.ts`** — a aritmética da escala em funções puras: semanas de segunda a
  domingo, o teto de 31 dias do backend, e `instanteNaOrganizacao`, que constrói o horário no
  fuso da organização em vez do fuso do aparelho.
- **`lerUltimoErro`** em `api.ts` — a última rota, status e horário de falha, para o
  diagnóstico. Nunca o corpo da resposta: ela pode carregar dado de terceiros, e a tela existe
  para ser colada numa conversa de suporte.
- **Comunicados do fundador no app** — `ComunicadoDoFundador` mostra a fila de campanhas
  modais, uma de cada vez. As regras (ordem por prioridade, SHOW_ONCE que persiste,
  SHOW_ALWAYS que volta na próxima abertura) estão puras em `src/nucleo/campanhas.ts`.
  **O `html` da campanha não é renderizado**: o site o exibe num iframe com sandbox, e o
  React Native não tem iframe — a alternativa seria uma WebView sem sandbox equivalente,
  dentro de um modal, num app instalado.
- **A escala na agenda do celular** — um calendário dedicado "Escala Fácil" com os próximos
  60 dias, sincronizado quando a pessoa toca, nunca em segundo plano. `calendario.ts` decide
  o que criar, atualizar e apagar (puro, testado); `calendario-do-sistema.ts` executa via
  `expo-calendar`.
- **Fluxos do Maestro** (`maestro/`) — os seis caminhos que não podem quebrar, escritos e
  ainda não executados: não há aparelho neste ambiente. O `06` afirma a **ausência** de
  "assinar", "plano", "renovar", "pagamento" e "R$" na tela de acesso suspenso; cada
  asserção corresponde a um motivo de rejeição pela regra 3.1.3(f).
- **CI no GitHub Actions** (`.github/workflows/verificar.yml`) — só neste repositório, como
  o plano definiu. Roda `npm run verificar` e empacota nas duas plataformas: `tsc` valida
  tipos, o Metro resolve módulos de verdade, e é o segundo que pega import inexistente.
- **169 testes novos** (326 no total), com vinte e cinco mutações verificadas: cada teste
  foi conferido quebrando de propósito o que ele diz cobrir.

### Corrigido

- **A lista de trocas do funcionário chamava `/requests/inbox`**, que é a caixa de entrada do
  **gestor**: exige OWNER/ADMIN mais `module_shift_requests_admin`. Um funcionário tomaria
  403 e — como 403 não é retentado — a tela diria "sem acesso" para quem tem acesso. As duas
  listas agora saem de `/requests/mine`, mudando `mine_mode`. Coberto por `consultas.test.ts`.
- **A lista de afastamentos não mandava `status`**, e `listRequestsQuerySchema` tem
  `.default('PENDING_ADMIN_APPROVAL')` — a tela diria "você não pediu nada" para quem já teve
  um pedido aprovado.
- **O registro de clique em notificação era tratado como telemetria pura**, mas `clickSchema`
  tem `mark_as_read` com padrão `true`: o servidor marca como lida no mesmo POST. Sem
  invalidar, o app mostrava negrito no que o servidor já lera.
- **`agruparTurnosPorDia` agrupava pelo dia UTC**, cortando a string ISO no `T`. Um turno que
  começa 22h em Brasília chega como `01:00Z` do dia seguinte e apareceria na data errada, sem
  erro nenhum na tela. É o mesmo defeito que `dateInTimezone.ts` corrigiu na grade do site;
  o agrupamento agora usa `toDateKeyInTimezone` com o fuso da organização, e o teste cobre a
  virada.

### Alterado

- `src/nucleo/consultas.ts` passa a expor `rotas`, `chaves` e **fábricas de opções** de
  mutação. As fábricas são o que torna invalidação de cache e desfazimento otimista testáveis
  sem montar componente nativo.
- `useSessao` ganhou `usuario` (id e e-mail) e `recarregarPerfil` — o resgate de convite muda
  o perfil por completo, de "sem organização" para "com papel e capacidades".

### Notas de operação

- **Nada de novo no cache local**, então esta versão pode ser revertida por
  `eas update:rollback` sem migração. A regra continua valendo: nunca publicar mudança de
  formato do cache sem migração — o rollback não desfaz o que já foi gravado no aparelho.
- **A Fase 7 usa `expo-calendar` em vez de um módulo nativo escrito por nós**, que era o que
  o plano previa. O motivo é a prioridade declarada para este app: pouca manutenção. Módulo
  próprio significaria duas pontes nativas, uma migração a cada versão do SDK e um plugin de
  configuração nosso — para chegar à mesma funcionalidade. O caminho de volta é barato:
  `calendario.ts` não sabe que `expo-calendar` existe.
- O `registrarAparelho` silencioso em `minha-escala` só age com a permissão **já concedida**.
  Nunca dispara o pedido do sistema; isso é da tela `/avisos`.
- **O Sentry precisa de três variáveis no ambiente do build**, e nenhuma no repositório:
  `SENTRY_DSN` (a única que atravessa para o aparelho, via `extra`), `SENTRY_ORG` e
  `SENTRY_PROJECT` para o plugin subir o mapa de fontes, mais `SENTRY_AUTH_TOKEN` como
  segredo do EAS. Faltando qualquer uma, o build **passa** — só não sobe mapa e o app não
  reporta. É de propósito: configuração de observabilidade nunca deve ser o que impede uma
  correção de chegar na loja.
- **Os quatro orçamentos do plano ainda não foram medidos.** Sessões sem falha e erro de API
  saem do painel assim que houver DSN e tráfego real; abertura a frio e adoção de versão
  precisam de aparelho e de loja. Nada disso é verificável nesta máquina.
