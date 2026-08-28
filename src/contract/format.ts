/**
 * Formatação para leitura humana — data, hora, moeda e ordenação de nomes.
 *
 * Existe por causa do aplicativo, mas vale para os dois. O `Intl` estava chamado em vinte
 * lugares diferentes, cada um com suas opções. No navegador isso funciona porque o ICU é
 * completo; no React Native com Hermes, o ICU do Android é parcial e falha de um jeito
 * traiçoeiro: em vez de erro, `pt-BR` cai silenciosamente para `en-US`. Data vira
 * "3/16/2026", moeda vira "$", e "Ávila" sai fora de ordem — sem nada quebrar.
 *
 * Centralizar resolve duas coisas de uma vez: o app carrega o polyfill num lugar só, e as
 * duas plataformas passam a formatar igual por construção, não por coincidência.
 *
 * ESTE ARQUIVO É COMPARTILHADO com o aplicativo e verificado por `check:contract`.
 * Nada de `window`, `document` ou import de componente aqui dentro.
 */

const LOCALE = 'pt-BR';

/** Cache dos formatadores: criar um `Intl.DateTimeFormat` é caro e isso roda por item de lista. */
const cacheData = new Map<string, Intl.DateTimeFormat>();
const cacheNumero = new Map<string, Intl.NumberFormat>();

function formatadorData(chave: string, opcoes: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = cacheData.get(chave);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, opcoes);
    cacheData.set(chave, f);
  }
  return f;
}

function formatadorNumero(chave: string, opcoes: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = cacheNumero.get(chave);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, opcoes);
    cacheNumero.set(chave, f);
  }
  return f;
}

/**
 * Número ou null. `Number(null)` é 0, e tratar ausência como zero mostraria "R$ 0,00" para
 * um dado que simplesmente não veio — o tipo de erro que passa despercebido justamente por
 * parecer um valor legítimo.
 */
function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * O `Intl` separa símbolo e número com espaço NÃO-SEPARÁVEL (U+00A0). Visualmente é igual
 * ao espaço comum, mas quebra comparação de texto e busca. Normalizamos para espaço comum:
 * o que se ganha em previsibilidade vale mais que a quebra de linha que o NBSP evita.
 */
function normalizarEspacos(texto: string): string {
  return texto.replace(/ /g, ' ');
}

/** Converte o que vier em Date, ou null se não der. Aceita Date, texto ISO e milissegundos. */
function paraData(valor: Date | string | number | null | undefined): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `16/03/2026`. Valor ilegível vira travessão, nunca "Invalid Date" na tela. */
export function formatarData(valor: Date | string | number | null | undefined): string {
  const d = paraData(valor);
  if (!d) return '—';
  return formatadorData('data', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** `16/03`, para cabeçalho de coluna e lista onde o ano é ruído. */
export function formatarDataCurta(valor: Date | string | number | null | undefined): string {
  const d = paraData(valor);
  if (!d) return '—';
  return formatadorData('dataCurta', { day: '2-digit', month: '2-digit' }).format(d);
}

/** `14:30`, sempre em 24h — 12h com AM/PM não é como se lê escala no Brasil. */
export function formatarHora(valor: Date | string | number | null | undefined): string {
  const d = paraData(valor);
  if (!d) return '--:--';
  return formatadorData('hora', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** `16/03/2026 14:30`. */
export function formatarDataHora(valor: Date | string | number | null | undefined): string {
  const d = paraData(valor);
  if (!d) return '—';
  return `${formatarData(d)} ${formatarHora(d)}`;
}

/** `seg`, `ter`… minúsculo e abreviado, como aparece na grade. */
export function formatarDiaDaSemana(valor: Date | string | number | null | undefined): string {
  const d = paraData(valor);
  if (!d) return '—';
  return formatadorData('diaSemana', { weekday: 'short' }).format(d).replace('.', '');
}

/**
 * `R$ 49,90`. Recebe CENTAVOS, não reais.
 *
 * O backend guarda dinheiro em centavos inteiros justamente para não ter arredondamento de
 * ponto flutuante; receber reais aqui reabriria essa porta.
 */
export function formatarMoeda(centavos: number | null | undefined): string {
  const n = paraNumero(centavos);
  if (n === null) return '—';
  return normalizarEspacos(formatadorNumero('moeda', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n / 100));
}

/** `49,9` — número com vírgula decimal, sem símbolo de moeda. */
export function formatarNumero(valor: number | null | undefined, casas = 1): string {
  const n = paraNumero(valor);
  if (n === null) return '—';
  return formatadorNumero(`num${casas}`, {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  }).format(n);
}

/**
 * Comparador de nomes que respeita acento e número.
 *
 * Sem ele, "Ávila" vai parar depois de "Zoe" (ordem de código de caractere) e "Sala 10"
 * vem antes de "Sala 2".
 */
const colador = new Intl.Collator(LOCALE, { sensitivity: 'base', numeric: true });

export function compararNomes(a: string, b: string): number {
  return colador.compare(String(a ?? ''), String(b ?? ''));
}

/** Ordena uma cópia — não mexe no array recebido. */
export function ordenarNomes<T>(itens: T[], chave: (item: T) => string): T[] {
  return [...itens].sort((x, y) => compararNomes(chave(x), chave(y)));
}
