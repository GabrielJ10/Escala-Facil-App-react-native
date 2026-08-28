# Fluxos do Maestro

Os seis caminhos que não podem quebrar. Quatro deles — 2, 3, 5 e 6 — **nunca são pegos por
teste de componente**, porque dependem de estado que só existe no aparelho: falta de sinal,
app fechado, versão do binário, assinatura do cliente.

| Arquivo | Fluxo |
|---|---|
| `01-entrar-e-responder-troca.yaml` | Entrar → ver a escala → aceitar troca |
| `02-sem-sinal.yaml` | Sem rede → escala em cache visível → ação recusada com clareza |
| `03-push-com-app-fechado.yaml` | App fechado → tocar no push → abre na tela certa |
| `04-gestor-turno-avulso.yaml` | Gestor cria turno avulso → aparece na escala |
| `05-versao-bloqueada.yaml` | Servidor exige versão maior → tela bloqueante |
| `06-inadimplente.yaml` | Cliente inadimplente → tela neutra, sem oferta e sem preço |

## Como rodar

```bash
# Instalar (uma vez)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Com um aparelho ou emulador conectado, e o app instalado
maestro test maestro/

# Um fluxo só
maestro test maestro/06-inadimplente.yaml
```

O `appId` sai de `APP_ID`, com o de desenvolvimento como padrão. Para rodar contra outro
ambiente:

```bash
maestro test -e APP_ID=br.app.escalafacil.stg maestro/
```

## O que estes fluxos exigem do ambiente

Não são testes isolados: falam com uma API de verdade. O que precisa existir antes:

| Fluxo | Precisa de |
|---|---|
| 01 | Um funcionário com senha conhecida e uma troca pendente para ele |
| 02 | O mesmo funcionário, com a escala já carregada uma vez |
| 03 | Push enviado pelo console do fundador para o aparelho de teste |
| 04 | Um gestor, um local e um modelo de turno ativo |
| 05 | `APP_MINIMUM_VERSION` acima da versão instalada |
| 06 | Um cliente com `billing_status` suspenso |

Os fluxos 5 e 6 mexem em estado do servidor. Rodá-los contra produção afetaria clientes
reais — use o ambiente de desenvolvimento (`APP_ID=br.app.escalafacil.dev`), que é o padrão.

As credenciais saem de variáveis, nunca do arquivo:

```bash
maestro test -e EMAIL=... -e SENHA=... maestro/01-entrar-e-responder-troca.yaml
```

## Estado: escritos, ainda não executados

**Estes fluxos nunca rodaram.** Não há aparelho nem emulador neste ambiente de
desenvolvimento, e o plano trata a validação em hardware real como um passo próprio (Portões
A e B). O que está aqui é o *que* verificar, que é a parte durável; os seletores são a parte
frágil e vão precisar de ajuste na primeira execução.

Esperar ajuste em, principalmente:

- **`04`** — os nomes de local e modelo variam por ambiente. Vêm de `LOCAL` e `MODELO`, com
  um padrão que só serve se o cadastro de teste usar esses nomes.
- **`03`** — a pausa de 60s é o ponto em que o operador dispara o push pelo console do
  fundador. Maestro não envia push sozinho.
- **`01` e `02`** — dependem de haver uma troca pendente. Os dois já tratam a ausência sem
  falhar, mas então não verificam a parte que interessa.

Ao rodar pela primeira vez, `maestro studio` mostra a árvore de elementos do app e os
seletores que realmente casam — é mais rápido que adivinhar a partir do código.

## Por que YAML e não código

Maestro tolera atraso e animação por construção: cada comando espera o elemento aparecer, em
vez de falhar no primeiro milissegundo. Num app que fala com rede num aparelho real, isso é a
diferença entre uma suíte útil e uma que falha aleatoriamente e é ignorada em duas semanas.

Os seletores usam `accessibilityLabel`, não texto de tela. Rótulo de acessibilidade é
contrato — mudá-lo quebra o leitor de tela, então ninguém o muda por acaso. Texto visível
muda numa revisão de copy.
