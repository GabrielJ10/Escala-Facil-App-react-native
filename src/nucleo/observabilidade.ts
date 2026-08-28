import * as Sentry from '@sentry/react-native';

import { AMBIENTE, EH_PRODUCAO, VERSAO_APP, SENTRY_DSN } from '@/nucleo/ambiente';

/**
 * Saber que o app está saudável sem saber nada sobre quem o usa.
 *
 * O plano pede quatro números — sessões sem falha, erro de API, abertura a frio, adoção da
 * última versão — e nada além. Este módulo entrega os dois primeiros; os outros dois saem do
 * console das lojas, que já os mede sem custo nenhum de privacidade.
 *
 * ## Por que sem DSN é silêncio, e não erro
 *
 * O DSN chega por variável de ambiente no build. Em desenvolvimento ele normalmente não
 * existe, e não deveria: relatório de erro de quem está editando código só polui o painel
 * onde o erro de gente de verdade precisa aparecer. Sem DSN o módulo inteiro vira função
 * vazia — nada é inicializado, nada é enviado, e nada quebra.
 *
 * ## Por que nenhum dado da pessoa é enviado
 *
 * Este app carrega escala, nome, cargo e e-mail de funcionário. Um relatório de erro que
 * leva junto o objeto que causou o erro leva junto isso tudo, para um servidor de terceiro,
 * sem ninguém ter pedido — e vira problema de LGPD e de Privacy Nutrition Label na App
 * Store, além de problema com a pessoa.
 *
 * Então: `sendDefaultPii` desligado, identificação por id de membro e mais nada (é o que
 * permite dizer "este erro atingiu 4 pessoas" sem saber quem são), e as migalhas de
 * navegação passam por uma peneira que descarta corpo de requisição e cabeçalho.
 */

/** Cabeçalhos que nunca saem do aparelho, nem dentro de uma migalha de navegação. */
const CABECALHOS_PROIBIDOS = new Set(['authorization', 'cookie', 'set-cookie', 'x-device-id']);

let ligado = false;

/** Se o relatório de erro está ativo — a tela de diagnóstico mostra isto. */
export function observabilidadeAtiva(): boolean {
  return ligado;
}

/**
 * A peneira das migalhas.
 *
 * O Sentry registra cada chamada de rede como migalha, e por padrão isso inclui a URL
 * inteira. Uma URL de escala carrega ids; um cabeçalho carrega o token. Nada disso precisa
 * estar num relatório para ele ser útil: o que importa é a rota, o método e o status.
 */
export function peneirarMigalha(
  migalha: Sentry.Breadcrumb | null,
): Sentry.Breadcrumb | null {
  if (!migalha) return null;

  // Console repete o que já está no erro, com risco de levar junto o que alguém logou por
  // engano. Toque é pior: `Sentry.wrap` registra o rótulo de acessibilidade do elemento
  // tocado, e neste app esse rótulo costuma ser o nome de um funcionário.
  if ((migalha.category === 'console' || migalha.category === 'touch') && EH_PRODUCAO) {
    return null;
  }

  const dados = migalha.data;
  if (!dados || typeof dados !== 'object') return migalha;

  const limpos: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    const nome = chave.toLowerCase();
    if (CABECALHOS_PROIBIDOS.has(nome)) continue;
    // O corpo é o que mais carrega dado de pessoa, e é o que menos ajuda a depurar.
    if (nome === 'body' || nome === 'data' || nome === 'response') continue;
    limpos[chave] = valor;
  }

  return { ...migalha, data: limpos };
}

/**
 * Liga o relatório de erro, se houver DSN.
 *
 * Chamada uma vez, no `_layout`, antes de qualquer tela montar — um erro na primeira
 * renderização é justamente o que mais interessa capturar.
 */
export function iniciarObservabilidade(): void {
  if (ligado || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: AMBIENTE,

    // `release` e `dist` são o que faz o mapa de fontes bater: sem eles o painel mostra
    // pilha empacotada, que é o mesmo que não ter relatório nenhum.
    release: `br.app.escalafacil@${VERSAO_APP}`,
    dist: VERSAO_APP,

    // Nunca. Ver o cabeçalho deste arquivo.
    sendDefaultPii: false,

    // 10% das transações em produção. O orçamento é "abertura a frio < 2s", e para uma
    // média não é preciso medir todo mundo — nem pagar por isso.
    tracesSampleRate: EH_PRODUCAO ? 0.1 : 1.0,

    beforeBreadcrumb: peneirarMigalha,
  });

  ligado = true;
}

/**
 * Quem está usando, pelo id e só.
 *
 * Sem nome e sem e-mail: o id responde "quantas pessoas isto atingiu" e "é sempre a mesma?",
 * que são as duas perguntas que um painel de erro precisa responder. Quem é a pessoa se
 * descobre no banco, com o id em mãos e motivo para olhar.
 */
export function identificarMembro(memberId: string | null): void {
  if (!ligado) return;
  Sentry.setUser(memberId ? { id: memberId } : null);
}

/**
 * Um erro que a interface já tratou, mas que ainda queremos ver.
 *
 * Falha de rede tratada com "sem conexão" na tela não é exceção não capturada, e por isso
 * não chegaria sozinha ao painel — mas se ela começar a acontecer com todo mundo, é
 * exatamente o que precisamos saber antes de o suporte perceber.
 */
export function registrarFalhaTratada(erro: unknown, contexto?: Record<string, string>): void {
  if (!ligado) return;
  Sentry.captureException(erro, contexto ? { tags: contexto } : undefined);
}
