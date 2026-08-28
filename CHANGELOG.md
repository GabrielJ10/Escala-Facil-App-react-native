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

**Sim.** `expo-notifications` e `expo-device` entraram como dependências nativas: pedem
permissão do sistema, canal de notificação no Android e entitlement de push no iOS. Nada
disso alcança um aparelho por `eas update` — precisa de `eas build` e passar pela loja.

Depois deste build, as telas e a lógica desta versão saem por `eas update` normalmente.

### Divergências introduzidas

Dez entradas novas em [`docs/divergencias-app-web.md`](docs/divergencias-app-web.md):

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

### Adicionado

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
- **143 testes novos** (300 no total), com vinte mutações verificadas: cada teste foi
  conferido quebrando de propósito o que ele diz cobrir.

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
- O `registrarAparelho` silencioso em `minha-escala` só age com a permissão **já concedida**.
  Nunca dispara o pedido do sistema; isso é da tela `/avisos`.
