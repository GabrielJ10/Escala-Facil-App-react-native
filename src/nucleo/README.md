# `src/nucleo` — a infraestrutura do aplicativo

## O que faz

Tudo que não é tela e não é cópia do site. É a camada em que moram as decisões que valem
para o app inteiro: como se fala com a API, onde a sessão é guardada, o que acontece quando a
rede cai, e qual texto a pessoa lê quando algo dá errado.

| Arquivo | Responsabilidade |
|---|---|
| `ambiente.ts` | Qual dos três ambientes este binário é, e qual API ele chama |
| `api.ts` | Cliente HTTP: cabeçalhos, renovação de sessão em voo único, tradução de erro |
| `armazenamento.ts` | O refresh token no cofre do sistema (Keychain / Keystore) |
| `sessao.tsx` | Quem está logado, com quais capacidades, e a restauração na abertura |
| `consultas.ts` | Rotas, chaves de cache e as opções de cada mutação |
| `apresentacao.ts` | As decisões de tela, em funções puras: textos de erro, rótulos, validações |
| `escala.ts` | A aritmética da escala do gestor: semanas, intervalos, instantes no fuso |
| `campanhas.ts` | As regras da fila de comunicados do fundador |
| `calendario.ts` | O que criar, atualizar e apagar no calendário do sistema |
| `calendario-do-sistema.ts` | A execução disso via `expo-calendar`, e o mapeamento em disco |
| `versao.ts` | Comparação de versão e o veredicto do portão |
| `push.ts` | Permissão, canal do Android, token do Expo e registro do aparelho |
| `ganchos-de-push.ts` | Abrir na tela certa quando alguém toca numa notificação |
| `rotas-do-push.ts` | Traduzir o destino do backend (caminho do site) para uma rota do app |
| `intl.ts` | Polyfill de `Intl` — precisa carregar antes de qualquer formatação |
| `tema.ts` | Os tokens visuais do site, em objeto |

A divisão que importa: **`apresentacao.ts` e `versao.ts` são puros e têm teste de verdade;
as telas são arranjo do que eles decidiram.** Testar componente React Native exige montar
meio ambiente nativo e raramente pega defeito; testar "qual texto aparece num 402" pega.

## De onde vêm os dados

Tudo passa por `apiFetch`, em `api.ts`, que fala com a API do backend (`EscalaFacil`) na URL
que `ambiente.ts` resolveu em tempo de build.

As rotas exatas estão em `consultas.ts`, no objeto `rotas` — exportadas de propósito, porque
uma rota errada vira 403 ou 404 só em campo, e nenhum `tsc` pega isso. `consultas.test.ts`
compara as strings com o que o backend realmente expõe.

Três armadilhas do backend que este módulo já contorna, documentadas onde aparecem:

- **`/requests/inbox` é do gestor**, não do funcionário: exige OWNER/ADMIN mais
  `module_shift_requests_admin`. As duas listas do funcionário saem de `/requests/mine`,
  mudando `mine_mode`.
- **`/absences/requests/mine` tem `status` com padrão**, então omitir não traz tudo — traz só
  as pendentes.
- **`/notifications/:id/click` marca como lida**: `mark_as_read` tem padrão `true`. Por isso
  o clique invalida as listas, não só registra telemetria.

O cache é do TanStack Query, persistido em `AsyncStorage` (configurado em `app/_layout.tsx`)
com 7 dias de validade. É o que cumpre a promessa de leitura offline.

## O que diverge do site

Quatro arquivos deste módulo divergem, e cada um tem entrada em
[`docs/divergencias-app-web.md`](../../docs/divergencias-app-web.md) com o motivo e a
alternativa descartada:

- **`api.ts`** — o refresh vive no cofre do sistema, não em cookie httpOnly, e viaja no corpo
  com `X-Client-Type: mobile`. Sessão perdida avisa quem escuta em vez de mexer em
  `window.location`.
- **`rotas-do-push.ts`** — traduz o caminho do site para rota do app; destino desconhecido cai
  na tela inicial em vez de virar erro; cobrança vai para a tela neutra, nunca para paywall.
- **`push.ts`** — não existe equivalente no site. Ramifica por plataforma no canal do Android
  e no `platform` do registro.
- **`tema.ts`** — os mesmos valores do `:root` do site, em hexadecimal, porque não há CSS aqui.

O `single-flight` de renovação em `api.ts` é **reimplementado**, não herdado: ele mora na
coluna que diverge, e por isso tem teste próprio. Sem esse teste, ele derivaria sem o
`check:contract` notar.

## Como testar

```bash
npm test                  # a suíte inteira
npx vitest run src/nucleo # só este módulo
npm run verificar         # typecheck + contrato + divergências + docs + testes
```

Os testes deste módulo rodam em Node puro, sem ambiente nativo — é o que os mantém rápidos e
é a razão de a lógica morar aqui em vez de dentro dos componentes.

Quando mexer em algo deste módulo, vale confirmar que o teste correspondente **falha** se a
mudança for revertida ao contrário. Os pontos que já foram verificados assim, e que devem
continuar quebrando quando quebrados:

| Se você quebrar | Deve falhar |
|---|---|
| a checagem de prazo em `podeResponderTroca` | `apresentacao.test.ts` |
| o desfazimento otimista em `opcoesMarcarLida` | `consultas.test.ts` |
| a rota `trocasParaMim` (apontando para `/requests/inbox`) | `consultas.test.ts` |
| a comparação numérica em `compararVersoes` | `versao.test.ts` |
| o fuso em `instanteNaOrganizacao` (usando o do aparelho) | `escala.test.ts` |
| o teto de 31 dias em `limitarIntervalo` | `escala.test.ts` |
| o tratamento do domingo em `semanaDe` | `escala.test.ts` |
| a invalidação em massa da escala (`chaves.escalaToda`) | `consultas.test.ts` |
| o dia no fuso da organização em `agruparTurnosPorDia` | `apresentacao.test.ts` |
| a persistência de SHOW_ONCE em `acaoAoFechar` | `campanhas.test.ts` |
| o descarte do `html` da campanha | `campanhas.test.ts` |
| o desempate por id em `ordenarPorPrioridade` | `campanhas.test.ts` |
| a janela em `planejarSincronizacao` (apagando fora dela) | `calendario.test.ts` |
| o fuso do dia gravado em `aplicarAoMapeamento` | `calendario.test.ts` |
| a invalidação do painel ao responder troca | `consultas.test.ts` |
| o "falha aberto" de `avaliarVersao` | `versao.test.ts` |
| o texto neutro do 402 (citando preço ou plano) | `apresentacao.test.ts` |
