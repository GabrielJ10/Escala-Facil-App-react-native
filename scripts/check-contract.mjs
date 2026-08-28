#!/usr/bin/env node
/**
 * Verificador do contrato compartilhado.
 *
 * Nove arquivos precisam ser BYTE A BYTE idênticos entre o site e o aplicativo: tipos,
 * chaves de cache, regras de negócio e formatação. Eles não são "código parecido" — são a
 * mesma verdade, e divergir neles significa os dois clientes discordarem sobre o que a API
 * respondeu ou sobre quem pode trocar de turno.
 *
 * Não usamos pacote npm porque tudo sobe junto e não há CI no backend nem no site: o
 * publish seria cerimônia manual para registrar uma informação já conhecida. O que o pacote
 * daria de verdade — impedir deriva silenciosa — este script dá por detecção.
 *
 * `api.ts` NÃO está aqui de propósito: ele diverge por desenho (localStorage e
 * window.location no site; SecureStore e navigation no app). A divergência está registrada
 * em docs/divergencias-app-web.md.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const ARQUIVOS = [
  'types.ts',
  'queryKeys.ts',
  'regrasHelpers.ts',
  'warningPresentation.ts',
  'requestTypes.ts',
  'dateInTimezone.ts',
  'cpf.ts',
  'qualificationTypes.ts',
  'format.ts',
];

const TESTES = [
  'cpf.test.ts',
  'dateInTimezone.test.ts',
  'regrasHelpers.test.ts',
  'warningPresentation.test.ts',
  'format.test.ts',
];

/**
 * O site fica ao lado por padrão. Sai por env quando não estiver — e falha com instrução
 * em vez de passar em silêncio por não ter o que comparar, que seria o pior desfecho: um
 * verificador verde que não verificou nada.
 */
const CAMINHO_SITE = process.env.CONTRACT_SITE_PATH
  || resolve(process.cwd(), '..', 'escala-facil-app-site');

if (!existsSync(CAMINHO_SITE)) {
  console.error(`
✖ Não encontrei o repositório do site para comparar.

  Procurei em: ${CAMINHO_SITE}

  Aponte com a variável de ambiente:
    CONTRACT_SITE_PATH=/caminho/para/escala-facil-app-site npm run check:contract
`);
  process.exit(2);
}

/** Ignora a diferença de fim de linha entre Windows e o resto — não é divergência real. */
function conteudoNormalizado(caminho) {
  return readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * O app importa de `@/contract/`, o site de `@/lib/`. É a única diferença tolerada, e é
 * mecânica: os arquivos moram em pastas com nomes diferentes.
 */
function paraComparacao(texto) {
  return texto.replace(/@\/contract\//g, '@/lib/');
}

function hash(texto) {
  return createHash('sha256').update(texto).digest('hex').slice(0, 12);
}

const divergentes = [];
const ausentes = [];

function comparar(nome, doSite, doApp) {
  if (!existsSync(doSite)) { ausentes.push(`${nome} (não existe no site)`); return; }
  if (!existsSync(doApp)) { ausentes.push(`${nome} (não existe no app)`); return; }

  const site = paraComparacao(conteudoNormalizado(doSite));
  const app = paraComparacao(conteudoNormalizado(doApp));

  if (site !== app) {
    divergentes.push({ nome, site: hash(site), app: hash(app) });
  }
}

for (const nome of ARQUIVOS) {
  comparar(nome, join(CAMINHO_SITE, 'src', 'lib', nome), join(process.cwd(), 'src', 'contract', nome));
}

for (const nome of TESTES) {
  comparar(nome, join(CAMINHO_SITE, 'src', 'test', nome), join(process.cwd(), 'src', 'contract', '__tests__', nome));
}

if (ausentes.length === 0 && divergentes.length === 0) {
  console.log(`✔ Contrato íntegro: ${ARQUIVOS.length} arquivos e ${TESTES.length} testes idênticos ao site.`);
  process.exit(0);
}

console.error('\n✖ O contrato compartilhado divergiu.\n');

for (const a of ausentes) console.error(`  AUSENTE     ${a}`);
for (const d of divergentes) console.error(`  DIVERGENTE  ${d.nome}  (site ${d.site} · app ${d.app})`);

console.error(`
  Estes arquivos são a mesma verdade nos dois clientes. Copie a versão correta
  para o outro lado antes de subir — e se a divergência for INTENCIONAL, o arquivo
  não pertence a este grupo: mova para fora e registre em docs/divergencias-app-web.md.
`);
process.exit(1);
