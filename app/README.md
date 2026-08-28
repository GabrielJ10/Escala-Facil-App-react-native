# `app` — as telas

## O que faz

Cada arquivo é uma rota, pela convenção do Expo Router: `app/trocas.tsx` responde por
`/trocas`. `_layout.tsx` é a raiz — monta os provedores, o portão de versão e a pilha de
navegação, nessa ordem.

| Rota | Para quem | O que faz |
|---|---|---|
| `index` | todos | Espera a sessão restaurar e encaminha para a escala ou para o login |
| `entrar` | todos | Login. Carrega o token do convite adiante, se veio de um |
| `claim-invite` | convidado | Resgate do convite do gestor. **O nome do arquivo é fixo** |
| `minha-escala` | funcionário | Próximo turno, os seguintes, e os atalhos. Tela inicial |
| `trocas` | funcionário | Duas listas: as que esperam resposta e as que eu pedi |
| `afastamentos` | funcionário | Pedir afastamento e acompanhar os próprios pedidos |
| `notificacoes` | todos | Central de avisos. Também é onde o push aterrissa |
| `perfil` | todos | Dados da conta, versão, diagnóstico e sair |
| `avisos` | todos | Explica o push **antes** de pedir a permissão do sistema |
| `solicitacoes` | gestor | O que está parado esperando decisão (leitura) |
| `escala` | gestor | A semana da equipe, dia a dia, com as vagas na frente |
| `turno/[id]` | gestor | Um turno: alocar da lista, ou tirar da escala |
| `turno-avulso` | gestor | Criar turno pontual — a forma de montar escala pelo celular |
| `indisponivel` | todos | A tela neutra de acesso suspenso. Sem preço, sem oferta |
| `calendario` | todos | Levar os turnos para a agenda do celular |
| `diagnostico` | suporte | Ambiente, versão, token de push, último erro |

Duas convenções que valem para todas:

- **A tela não decide texto de erro nem regra de habilitação.** Isso está em
  `src/nucleo/apresentacao.ts`, que é puro e tem teste. A tela chama e arranja.
- **Todo alvo de toque tem `accessibilityLabel` e no mínimo 44pt** (`TOQUE_MINIMO`). O site
  já teve o defeito de botões de ícone sem rótulo nas setas da grade; aqui é piso.

## De onde vêm os dados

Nenhuma tela chama `apiFetch` diretamente — todas passam pelos hooks de
`src/nucleo/consultas.ts`, que centraliza rotas, chaves de cache e política de retentativa.
A exceção é `claim-invite.tsx`, que faz um `POST` único fora do ciclo de cache porque o
resgate não é dado a ser cacheado; a trava de uma tentativa por montagem está no próprio
arquivo.

O que cada tela consome:

- `minha-escala` → `/users/me/dashboard`, que já devolve o agregado pronto. É o que a mantém
  rápida na abertura a frio.
- `trocas` → `/requests/mine` duas vezes, com `mine_mode` diferente.
- `afastamentos` → `/absences/requests/mine?status=…`, uma chamada por filtro.
- `notificacoes` → `/notifications?status=ALL` e `/notifications/summary`.
- `solicitacoes` → `/requests/inbox` e `/absences/requests`, ambas só com a capacidade certa.
- `escala` → `/shifts?start_date=…&end_date=…`, com o intervalo já cortado em 31 dias por
  `limitarIntervalo`: o backend recusa acima disso com 400, não com uma lista cortada.
- `turno/[id]` → o cache da semana (`GET /shifts/:id` não existe no backend), mais `/users`
  para a lista de quem pode ser alocado.
- `turno-avulso` → `/locations` e `/shift-models`, ambos com `staleTime` de uma hora: são
  cadastro, não movimento, e recarregá-los a cada toque custaria em toda sessão.
- `calendario` → nada de novo: reaproveita os turnos que `/users/me/dashboard` já trouxe.
  O destino não é a API, é o calendário do aparelho.

Leitura funciona sem rede, servida pelo cache persistido. **Escrita não** — e a recusa é
explícita, porque falhar de forma estranha ensina a pessoa a não confiar no app.

## O que diverge do site

As telas são onde a diferença é maior, e é intencional. As entradas completas estão em
[`docs/divergencias-app-web.md`](../docs/divergencias-app-web.md):

- **`minha-escala`** — lista, não grade. A grade do site é local × dia com 1080px de largura
  mínima; num aparelho de 390px caberiam três dias.
- **`afastamentos`** — é a tela de *pedir*, não a `AfastamentosPage` de 1.187 linhas, que é de
  gestor e exige `module_absences`.
- **`solicitacoes`** — leitura apenas. Aprovar exige o `preview_hash` de
  `/requests/:id/preview-impact`, e o preview traz os conflitos que o gestor precisa ver antes
  de decidir. Um botão que pulasse isso decidiria no escuro.
- **`indisponivel`** — não existe no site. Nasce da regra 3.1.3(f) da Apple: sem preço, sem
  plano, sem link para pagar.
- **`avisos`** — não existe no site, porque no navegador não há permissão de push a queimar.
  No iOS a recusa é definitiva, então o pedido do sistema vem depois da explicação.
- **`perfil`** — `Alert.alert` no lugar do `window.confirm`, com os botões nomeados pela ação.

`claim-invite.tsx` **não pode ser renomeado**. O nome espelha a rota do site e é o que o
universal link casa; trocar por um nome em português quebraria todos os convites já enviados,
que vivem na caixa de e-mail de alguém e não no nosso código.

## Como testar

```bash
npm test              # a lógica que as telas consomem
npm run verificar     # typecheck + contrato + divergências + docs + testes
npx expo start        # rodar de verdade
```

As telas em si não têm teste unitário, e isso é decisão registrada: montar React Native sob
Vitest exigiria transformar Flow, apelidar `react-native-web` e simular `expo-router`,
`gesture-handler` e `safe-area-context` — muita manutenção para testar um renderizador que
não é o do aparelho. O que quebra de verdade mora em `src/nucleo/apresentacao.ts`, que é puro
e tem cobertura.

O que cobre a tela montada é o Maestro, com os seis fluxos que não podem quebrar:

1. Entrar → ver minha escala → aceitar troca
2. Sem sinal → escala carregada visível → tentar ação → recusa clara
3. App fechado → tocar no push → abre na tela certa, autenticado
4. Gestor: criar turno avulso → aparece na escala
5. Servidor exige versão maior → tela bloqueante
6. Tenant inadimplente → tela neutra, sem oferta e sem preço

Antes de qualquer commit que mexa em tela, rodar `npx expo export --platform android`: é o
único passo que pega erro de importação em tempo de empacotamento — foi ele que apanhou o
`@formatjs/…/locale-data/pt-BR` inexistente que o `tsc` deixou passar.
