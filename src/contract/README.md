# `src/contract` — a cópia verificada do site

## O que faz

Nove arquivos de código e cinco de teste que são **byte a byte idênticos** aos do site. Não é
"código parecido": é a mesma verdade, e divergir aqui significa os dois clientes discordarem
sobre o que a API respondeu ou sobre quem pode trocar de turno.

| Arquivo | O que carrega |
|---|---|
| `types.ts` | As formas que a API devolve |
| `queryKeys.ts` | Chaves de cache compartilhadas |
| `regrasHelpers.ts` | As regras de cobertura da escala |
| `warningPresentation.ts` | Como um aviso de conflito é apresentado |
| `requestTypes.ts` | Tipos de troca e afastamento (importado por `warningPresentation`) |
| `dateInTimezone.ts` | A data no fuso da organização, não no do aparelho |
| `cpf.ts` | Validação de CPF |
| `qualificationTypes.ts` | Qualificações exigidas por turno |
| `format.ts` | Data, hora, moeda e ordenação de nomes |

**Os testes entram no contrato, e isso é o ponto.** O site já os tinha em Vitest. Se o app
usasse Jest, as fontes ficariam idênticas e os testes bifurcariam em silêncio — exatamente o
que o verificador existe para impedir. É por isso que o app roda Vitest.

Não usamos pacote npm: tudo sobe junto, e não há CI no backend nem no site, então o publish
seria cerimônia manual para registrar informação já conhecida. O que o pacote daria de
verdade — impedir deriva silenciosa — `check:contract` dá por detecção.

## De onde vêm os dados

Destes arquivos, nenhum busca nada: são tipos e funções puras. É condição para estarem aqui.
O fecho transitivo foi verificado — o único import interno é
`warningPresentation → requestTypes`, e nenhum deles importa de `@/` fora do próprio grupo.

A fonte é o repositório do site, que `check:contract` procura na pasta irmã
`escala-facil-app-site` ou no caminho de `CONTRACT_SITE_PATH`. Se não achar, o script **falha
com instrução** em vez de passar em silêncio — um verificador verde que não verificou nada é
o pior desfecho possível.

Alterar qualquer arquivo daqui significa alterar o mesmo arquivo no site, no mesmo commit.
Não há "corrigir só no app".

## O que diverge do site

Nada. É a definição do módulo, e `check:contract` compara o hash de cada arquivo para provar.

Dois arquivos que *pareceriam* pertencer aqui e ficaram de fora, cada um por um motivo:

- **`api.ts`** — diverge por desenho: `localStorage` e `window.location` no site, cofre do
  sistema e navegação injetada no app.
- **`notificationTypes.ts`** — `resolveNotificationTargetPath` depende de
  `window.location.origin`, e o resultado dele (um caminho do site) não serve para navegar no
  app. O substituto é `src/nucleo/rotas-do-push.ts`.

Ambos têm entrada em [`docs/divergencias-app-web.md`](../../docs/divergencias-app-web.md).

Há um limite que o hash **não** cobre, e que vale ter em mente: arquivos idênticos podem se
comportar diferente por plataforma. É o caso do `Intl` — o Hermes no Android tem ICU parcial,
e `format.ts` renderiza data em inglês sem que nada quebre. Por isso o polyfill em
`src/nucleo/intl.ts` e a validação em aparelho real (Portão B do plano). O `check:contract`
fica verde enquanto o app calcula o dia errado.

## Como testar

```bash
npm run check:contract    # compara byte a byte com o site
npx vitest run src/contract
npm run verificar         # typecheck + contrato + divergências + docs + testes
```

Se o site não estiver na pasta irmã:

```bash
CONTRACT_SITE_PATH=/caminho/para/escala-facil-app-site npm run check:contract
```

Para confirmar que o verificador funciona, altere um caractere de qualquer arquivo deste
módulo e rode `npm run check:contract`: ele deve falhar apontando o arquivo. Um verificador
que nunca reprovou não é prova de que o contrato está íntegro — é prova de que ninguém testou
o verificador.

Ao trazer uma mudança do site, copie **o arquivo e o teste dele** juntos, e rode
`npm run verificar` inteiro: o typecheck do app é `strict` e o do site não é, então mudanças
que compilam lá podem não compilar aqui. Quando isso acontecer, a correção vai **no site** —
e depois se recopia. Corrigir só no lado do app quebra o contrato na commit seguinte.
