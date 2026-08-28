/**
 * Os polyfills do `@formatjs` são importados só pelo efeito colateral — eles registram os
 * dados de idioma no `Intl` global e não exportam nada. Sob `strict`, o TypeScript exige
 * declaração até para import sem binding, e os pacotes de dados não trazem uma.
 */
declare module '@formatjs/intl-locale/polyfill';
declare module '@formatjs/intl-pluralrules/polyfill';
declare module '@formatjs/intl-pluralrules/locale-data/pt';
declare module '@formatjs/intl-numberformat/polyfill';
declare module '@formatjs/intl-numberformat/locale-data/pt';
declare module '@formatjs/intl-datetimeformat/polyfill';
declare module '@formatjs/intl-datetimeformat/locale-data/pt';
declare module '@formatjs/intl-datetimeformat/add-all-tz';
