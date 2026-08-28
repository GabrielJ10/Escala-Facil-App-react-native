# `src/componentes` — o que se repete entre telas

## O que faz

Três componentes, e cada um existe porque a alternativa é pior:

**`Estados.tsx`** — `Carregando`, `Vazio`, `Erro` e `FaixaDeErro`. Sem um lugar comum, cada
tela inventa o seu, e as diferenças aparecem justamente nos momentos ruins: uma diz "erro",
outra mostra tela branca, uma terceira deixa o giro rodando para sempre. O usuário aprende
que o app é instável mesmo quando só falta sinal.

A distinção entre `Erro` e `FaixaDeErro` é de propósito: `Erro` substitui a tela, para quando
o carregamento falhou e não há nada para mostrar; `FaixaDeErro` avisa sem tirar o conteúdo,
para quando uma *ação* falhou e a lista que já estava na frente da pessoa continua correta.

**`CartaoTurno.tsx`** — um turno na lista. `memo` e altura fixa não são zelo prematuro: é a
única coisa que se repete centenas de vezes na tela do funcionário, e o orçamento é 60fps com
500 itens. A altura constante (`ALTURA_CARTAO_TURNO`) deixa a lista virtualizada calcular
posição sem medir item a item, que é o que faz rolagem longa engasgar.

**`PortaoDeVersao.tsx`** — envolve o app inteiro e bloqueia quando o binário é velho demais
para falar com o servidor. A regra mais importante aqui é **falhar aberto**: sem resposta, com
resposta ilegível, ou com a consulta em voo, as crianças renderizam normalmente.

## De onde vêm os dados

`Estados` e `CartaoTurno` não buscam nada — recebem por props. `Erro` e `FaixaDeErro` chamam
`mensagemDeErro` de `src/nucleo/apresentacao.ts`, que é pura: o componente arranja, a função
decide. É o que torna testável a garantia de que a mensagem de 402 não vende nada.

`PortaoDeVersao` é a exceção: consulta `/app/version-gate` por `usePortaoDeVersao`. A rota é
pública e não passa pelo portão de cobrança, porque o app precisa perguntar antes de ter
sessão — alguém preso numa versão incompatível não conseguiria nem descobrir o motivo. O
veredicto sai de `avaliarVersao`, também pura e testada.

## O que diverge do site

`Estados` e `CartaoTurno` não têm equivalente: o site resolve estado vazio e erro dentro de
cada página, e o cartão é uma célula da grade.

`PortaoDeVersao` diverge por existir — não há binário antigo instalado num navegador — e
ramifica por `Platform.OS` para escolher entre a App Store e a Play Store. Mandar um usuário
de iPhone para a Play Store é um beco sem saída. A entrada completa está em
[`docs/divergencias-app-web.md`](../../docs/divergencias-app-web.md).

O tema vem de `src/nucleo/tema.ts`, que carrega os mesmos valores do `:root` do site em
hexadecimal. As cores são as mesmas; muda a representação.

## Como testar

```bash
npm test           # a lógica que estes componentes consomem
npm run verificar  # typecheck + contrato + divergências + docs + testes
```

Não há teste de renderização, e isso é decisão registrada — ver
[`app/README.md`](../../app/README.md#como-testar) para o raciocínio completo. O resumo:
montar React Native sob Vitest exigiria transformar Flow e simular meia dúzia de módulos
nativos, para testar um renderizador que não é o do aparelho.

O que estes componentes decidem está coberto pelos testes puros:

- o texto de cada tipo de erro, e a garantia de que o 402 não cita preço →
  `src/nucleo/__tests__/apresentacao.test.ts`
- o veredicto do portão, incluindo o "falha aberto" → `src/nucleo/__tests__/versao.test.ts`

O que sobra — se o componente realmente aparece na tela, e com que aparência — é verificado
pelos fluxos do Maestro e por um aparelho de verdade. O simulador mente sobre desempenho.
