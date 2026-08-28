#!/usr/bin/env node
/**
 * Toda divergência entre app e site precisa estar documentada.
 *
 * Varre o código atrás dos três sinais de que algo se comporta diferente por plataforma —
 * `Platform.OS`, `Platform.select` e arquivos `.ios.tsx` / `.android.tsx` — e exige que o
 * caminho apareça em docs/divergencias-app-web.md.
 *
 * O objetivo não é dificultar divergir: é impedir que divergir seja SILENCIOSO. Meses
 * depois, "por que isso é diferente aqui?" é uma pergunta cara de responder sem o motivo
 * escrito ao lado.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const REGISTRO = join(RAIZ, 'docs', 'divergencias-app-web.md');
const PASTAS = ['src', 'app'];
const SINAIS = [/\bPlatform\.OS\b/, /\bPlatform\.select\b/];

if (!existsSync(REGISTRO)) {
  console.error('✖ docs/divergencias-app-web.md não existe. Ele é obrigatório.');
  process.exit(2);
}

const registro = readFileSync(REGISTRO, 'utf8');

function percorrer(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) percorrer(caminho, acc);
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

const naoRegistrados = [];

for (const arquivo of PASTAS.flatMap((p) => percorrer(join(RAIZ, p)))) {
  const rel = relative(RAIZ, arquivo).split(String.fromCharCode(92)).join('/');

  // Testes do contrato são cópia do site — divergir neles é problema do check:contract.
  if (rel.includes('/contract/')) continue;

  const porNome = /\.(ios|android)\.tsx?$/.test(rel);
  const conteudo = readFileSync(arquivo, 'utf8');
  const porCodigo = SINAIS.some((s) => s.test(conteudo));

  if (!porNome && !porCodigo) continue;

  // Basta o caminho aparecer no registro — não exigimos formato rígido, para o documento
  // continuar legível por gente.
  if (!registro.includes(rel)) {
    naoRegistrados.push({ rel, motivo: porNome ? 'arquivo por plataforma' : 'ramifica por Platform' });
  }
}

if (naoRegistrados.length === 0) {
  console.log('✔ Nenhuma divergência de plataforma fora do registro.');
  process.exit(0);
}

console.error('\n✖ Divergência de plataforma sem registro.\n');
for (const d of naoRegistrados) console.error(`  ${d.rel}  (${d.motivo})`);
console.error(`
  Acrescente uma entrada em docs/divergencias-app-web.md com:
    **Onde:** o caminho do arquivo
    **Site faz:** / **App faz:** / **Por quê:** / **Descartado:**

  Divergir é permitido. Divergir sem dizer por quê, não.
`);
process.exit(1);
