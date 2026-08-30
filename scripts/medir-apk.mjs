#!/usr/bin/env node
/**
 * Onde estão os megabytes de um APK.
 *
 * Existe porque o primeiro APK deste projeto saiu com 101 MB contra um orçamento de 40, e a
 * resposta para "o que cortar" não era adivinhável: 75 MB eram bibliotecas nativas, e mais
 * da metade disso era o mesmo código compilado para arquiteturas que celular nenhum usa.
 * Sem abrir o arquivo, o palpite natural teria sido imagens ou o pacote JavaScript — os dois
 * juntos não chegam a 7 MB.
 *
 * Lê o índice central do ZIP direto, sem dependência: o APK é um ZIP, e o índice já traz o
 * tamanho comprimido de cada arquivo, que é o que de fato ocupa espaço no aparelho.
 *
 * Uso:
 *   npm run medir-apk -- caminho/para/app.apk
 *   npm run medir-apk -- https://expo.dev/artifacts/eas/....apk
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** O orçamento do plano do produto, em MB. */
const ORCAMENTO_MB = 40;

/** Arquiteturas que só existem em emulador — num APK para celular, são peso morto. */
const SO_EMULADOR = new Set(['x86', 'x86_64']);

const MB = 1024 * 1024;
const mb = (bytes) => bytes / MB;
const fmt = (n) => n.toFixed(1).padStart(6);

/**
 * Os arquivos de um ZIP, pelo índice central.
 *
 * Só o índice é lido — nada é descomprimido. O campo que interessa é o tamanho comprimido:
 * é ele que ocupa espaço no APK, e pode ser muito menor que o original.
 */
function lerEntradasZip(buf) {
  // Fim do índice central: assinatura 0x06054b50, procurada de trás para frente porque o
  // comentário final do ZIP tem tamanho variável.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65535; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Não parece um ZIP: fim do índice central não encontrado.');

  const total = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const entradas = [];

  for (let i = 0; i < total; i += 1) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;

    const comprimido = buf.readUInt32LE(pos + 20);
    const tamNome = buf.readUInt16LE(pos + 28);
    const tamExtra = buf.readUInt16LE(pos + 30);
    const tamComentario = buf.readUInt16LE(pos + 32);
    const nome = buf.toString('utf8', pos + 46, pos + 46 + tamNome);

    entradas.push({ nome, comprimido });
    pos += 46 + tamNome + tamExtra + tamComentario;
  }

  return entradas;
}

/** Soma por chave, do maior para o menor. */
function agrupar(entradas, chaveDe) {
  const mapa = new Map();
  for (const e of entradas) {
    const chave = chaveDe(e);
    if (chave === null) continue;
    const atual = mapa.get(chave) || { bytes: 0, arquivos: 0 };
    atual.bytes += e.comprimido;
    atual.arquivos += 1;
    mapa.set(chave, atual);
  }
  return [...mapa.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
}

async function obterArquivo(alvo) {
  if (!/^https?:\/\//i.test(alvo)) {
    if (!existsSync(alvo)) throw new Error(`Arquivo não encontrado: ${alvo}`);
    return readFileSync(alvo);
  }

  console.log('  baixando...');
  const resposta = await fetch(alvo);
  if (!resposta.ok) throw new Error(`Download falhou: HTTP ${resposta.status}`);

  const buf = Buffer.from(await resposta.arrayBuffer());
  // Guardado em disco para poder medir de novo sem baixar outra vez.
  const destino = join(tmpdir(), 'apk-medido.apk');
  writeFileSync(destino, buf);
  console.log(`  guardado em ${destino}\n`);
  return buf;
}

function relatarPastas(entradas, totalBytes) {
  console.log('── Por pasta ──────────────────────────────────────────────────\n');
  const porPasta = agrupar(entradas, (e) => e.nome.split('/')[0]);

  for (const [pasta, dados] of porPasta.slice(0, 8)) {
    const pct = ((dados.bytes / totalBytes) * 100).toFixed(0).padStart(3);
    console.log(`  ${fmt(mb(dados.bytes))} MB  ${pct}%  ${pasta}  (${dados.arquivos} arquivos)`);
  }
  console.log();
}

/**
 * A parte que responde à pergunta cara.
 *
 * Bibliotecas nativas são o mesmo código compilado uma vez por arquitetura. Num APK
 * universal todas viajam juntas; num AAB a loja separa e cada pessoa baixa só a sua.
 */
function relatarArquiteturas(entradas) {
  const libs = entradas.filter((e) => e.nome.startsWith('lib/'));
  if (libs.length === 0) return;

  console.log('── Bibliotecas nativas, por arquitetura ───────────────────────\n');
  const porArq = agrupar(libs, (e) => e.nome.split('/')[1]);

  let desperdicio = 0;
  for (const [arq, dados] of porArq) {
    const marca = SO_EMULADOR.has(arq) ? '  ← só emulador' : '';
    if (SO_EMULADOR.has(arq)) desperdicio += dados.bytes;
    console.log(`  ${fmt(mb(dados.bytes))} MB  ${arq}${marca}`);
  }

  console.log('\n── As maiores bibliotecas (somando as arquiteturas) ───────────\n');
  for (const [lib, dados] of agrupar(libs, (e) => e.nome.split('/')[2]).slice(0, 6)) {
    console.log(`  ${fmt(mb(dados.bytes))} MB  ${lib}  (${dados.arquivos}x)`);
  }
  console.log();

  if (desperdicio > 0) {
    console.log(
      `  ⚠ ${mb(desperdicio).toFixed(1)} MB em arquiteturas que só existem em emulador.\n`
      + '    Num APK para celular isso é peso morto — restrinja com ANDROID_ARCHS no perfil\n'
      + '    do eas.json. Num AAB da loja é diferente: a Play divide por aparelho, e ali\n'
      + '    manter x86_64 permite instalar em Chromebook sem custar nada a quem usa celular.\n',
    );
  }
}

function relatarOrcamento(totalBytes) {
  const total = mb(totalBytes);
  console.log('── Orçamento ──────────────────────────────────────────────────\n');
  console.log(`  medido    ${total.toFixed(1)} MB`);
  console.log(`  orçamento ${ORCAMENTO_MB} MB (plano do produto)`);

  if (total <= ORCAMENTO_MB) {
    console.log('\n  ✔ dentro do orçamento.\n');
    return;
  }

  console.log(
    `\n  ✖ ${(total - ORCAMENTO_MB).toFixed(1)} MB acima.\n\n`
    + '    Lembre que o número que importa para o usuário é o do AAB depois do split da\n'
    + '    Play, não o do APK universal — meça os dois antes de concluir que há problema.\n',
  );
}

async function principal() {
  const alvo = process.argv[2];
  if (!alvo) {
    console.error('Uso: npm run medir-apk -- <caminho ou URL de um .apk>');
    process.exit(2);
  }

  const buf = await obterArquivo(alvo);
  const entradas = lerEntradasZip(buf);
  const totalBytes = buf.length;

  console.log(`\n  ${entradas.length} arquivos, ${mb(totalBytes).toFixed(1)} MB no total\n`);
  relatarPastas(entradas, totalBytes);
  relatarArquiteturas(entradas);
  relatarOrcamento(totalBytes);
}

await principal();
