/**
 * Polyfill de internacionalização — precisa rodar ANTES de qualquer formatação.
 *
 * O Hermes no Android vem com ICU parcial. A falha não é um erro: `pt-BR` cai
 * silenciosamente para `en-US`, e aí a data vira "3/16/2026", a moeda vira "$" e "Ávila"
 * sai fora de ordem. Nada quebra — só fica errado.
 *
 * Os dados sao de 'pt', nao 'pt-BR': no CLDR o portugues base E o brasileiro, e as
 * variantes com sufixo sao as OUTRAS (pt-PT, pt-AO). Pedir 'pt-BR' nao resolve.
 *
 * A ordem dos imports importa: `locale` sustenta os outros, e cada formatador precisa dos
 * dados do idioma carregados depois dele.
 */
import '@formatjs/intl-locale/polyfill';

import '@formatjs/intl-pluralrules/polyfill';
import '@formatjs/intl-pluralrules/locale-data/pt';

import '@formatjs/intl-numberformat/polyfill';
import '@formatjs/intl-numberformat/locale-data/pt';

import '@formatjs/intl-datetimeformat/polyfill';
import '@formatjs/intl-datetimeformat/locale-data/pt';
import '@formatjs/intl-datetimeformat/add-all-tz';
