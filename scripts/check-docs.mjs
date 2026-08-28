#!/usr/bin/env node
/**
 * Todo módulo tem README, e todo README responde as mesmas quatro perguntas.
 *
 * A intenção não é encher o repositório de arquivo: é que a próxima pessoa — que pode ser
 * você em seis meses — não precise ler o código para saber de onde vêm os dados de uma tela
 * ou por que ela é diferente do site.
 *
 * As quatro perguntas foram escolhidas por serem as que se faz sempre, e cuja resposta não
 * está no código:
 *
 *   - **O que faz** está no código, mas espalhado.
 *   - **De onde vêm os dados** exige seguir import por import até o `apiFetch`.
 *   - **O que diverge do site** não está em lugar nenhum, por definição.
 *   - **Como testar** economiza a busca pelo comando certo.
 *
 * Documentação que ninguém verifica apodrece. Este script é a verificação.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();

/** Um módulo é uma pasta com código próprio. Pastas de teste não contam. */
const MODULOS = ['app', 'src/nucleo', 'src/componentes', 'src/contract'];

const SECOES = [
  { titulo: 'O que faz', padrao: /^##\s+O que faz\s*$/m },
  { titulo: 'De onde vêm os dados', padrao: /^##\s+De onde vêm os dados\s*$/m },
  { titulo: 'O que diverge do site', padrao: /^##\s+O que diverge do site\s*$/m },
  { titulo: 'Como testar', padrao: /^##\s+Como testar\s*$/m },
];

/** Um README que só tem os títulos é pior que nenhum: passa na verificação e não informa. */
const MINIMO_DE_CARACTERES_POR_SECAO = 80;

function corpoDaSecao(conteudo, indice) {
  const inicio = conteudo.search(SECOES[indice].padrao);
  if (inicio < 0) return '';

  const depois = conteudo.slice(inicio);
  const fim = depois.slice(1).search(/^##\s+/m);
  const bruto = fim < 0 ? depois : depois.slice(0, fim + 1);

  // Descarta a própria linha do título antes de medir.
  return bruto.split('\n').slice(1).join('\n').trim();
}

const problemas = [];

for (const modulo of MODULOS) {
  const pasta = join(RAIZ, modulo);
  if (!existsSync(pasta)) continue;

  const temCodigo = readdirSync(pasta).some((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isFile() && /\.(ts|tsx)$/.test(nome);
  });
  if (!temCodigo) continue;

  const readme = join(pasta, 'README.md');
  if (!existsSync(readme)) {
    problemas.push(`${modulo}/README.md não existe`);
    continue;
  }

  const conteudo = readFileSync(readme, 'utf8').split('\r\n').join('\n');

  SECOES.forEach((secao, i) => {
    if (!secao.padrao.test(conteudo)) {
      problemas.push(`${modulo}/README.md não tem a seção "## ${secao.titulo}"`);
      return;
    }

    const corpo = corpoDaSecao(conteudo, i);
    if (corpo.length < MINIMO_DE_CARACTERES_POR_SECAO) {
      problemas.push(
        `${modulo}/README.md tem "## ${secao.titulo}" praticamente vazia `
        + `(${corpo.length} caracteres; o mínimo é ${MINIMO_DE_CARACTERES_POR_SECAO})`,
      );
    }
  });
}

if (problemas.length === 0) {
  console.log(`✔ Documentação de módulo completa em ${MODULOS.length} módulos.`);
  process.exit(0);
}

console.error('\n✖ Documentação de módulo incompleta.\n');
for (const p of problemas) console.error(`  ${relative('.', p)}`);
console.error(`
  Cada módulo precisa de um README.md com estas quatro seções:
    ## O que faz
    ## De onde vêm os dados
    ## O que diverge do site
    ## Como testar

  Seção vazia não conta. Se não há divergência, escreva que não há — e por quê.
`);
process.exit(1);
