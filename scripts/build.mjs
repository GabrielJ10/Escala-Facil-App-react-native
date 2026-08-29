#!/usr/bin/env node
/**
 * Gera builds do aplicativo, com as armadilhas conferidas antes de gastar a fila.
 *
 * O `eas build` sozinho já monta o app. Este script existe pelo que ele NÃO faz: avisar
 * quando o que você pediu não é o que você quer. Um build de Android leva de 10 a 40 minutos
 * na fila gratuita, e as três formas mais comuns de perder esse tempo são silenciosas:
 *
 *   1. **AAB não instala no celular.** É o padrão do EAS para Android, e só a Play Store
 *      abre. Você espera a fila, baixa o arquivo, e descobre no aparelho.
 *   2. **A API do perfil pode não existir.** O perfil `staging` aponta para um domínio que
 *      hoje não resolve no DNS. O app instala, abre, e falha em toda requisição.
 *   3. **`development` aponta para 10.0.2.2**, que é o apelido do emulador Android para o
 *      localhost da sua máquina. Num celular de verdade esse endereço não significa nada.
 *
 * As três viram aviso antes do build começar, não depois.
 *
 * O script não repete o mapeamento de ambiente: ele pergunta ao `expo config`, que lê o
 * `app.config.ts`. Assim nome, bundle ID e URL da API mostrados aqui são exatamente os que
 * vão para dentro do binário — e mudar o `app.config.ts` não deixa este script mentindo.
 *
 * Uso:
 *   npm run build -- --perfil staging --api https://api.escalafacil.app.br/api/v1
 *   npm run build -- --ajuda
 */
import { spawn, spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';

/**
 * Duas formas de chamar ferramenta externa, e as duas evitam o mesmo problema.
 *
 * No Windows o `npx` é um `.cmd`, e desde a 18.20 o Node recusa executar `.cmd` sem
 * `shell: true` (EINVAL) — é proteção contra injeção por argumento. Com shell ligado, os
 * argumentos são concatenados sem escapar, então qualquer coisa vinda da linha de comando
 * vira superfície de ataque.
 *
 * O `expo` está instalado aqui, então ele é chamado pelo próprio Node, direto no arquivo
 * de entrada: sem shell, sem `npx`, sem risco. O `eas-cli` não é dependência do projeto e
 * precisa do `npx`; para ele o shell é inevitável, e a defesa passa a ser validar tudo que
 * chega antes de compor o comando — ver `validarMensagem`.
 */
const EXPO_CLI = 'node_modules/expo/bin/cli';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

/**
 * A mensagem é o único texto livre que vai parar na linha de comando, e ela atravessa o
 * shell. Uma lista de permissão estreita é mais fácil de conferir do que escapar certo.
 *
 * O que está de fora é o que importa: `&`, `|`, `;`, `$`, crase, aspas, `<`, `>` e também
 * `(` e `)` — estes dois porque no `cmd.exe` do Windows são separadores, e não apenas
 * parênteses. Sobra o suficiente para "teste no Moto G, build 3".
 */
function validarMensagem(texto) {
  if (/^[a-zA-Z0-9À-ÿ .,_+-]{1,200}$/u.test(texto)) return texto;
  throw new Error(
    'A mensagem só aceita letras, números, espaços e . , _ + - (até 200 caracteres). '
    + 'Ela vai para a linha de comando do EAS, então a lista é curta de propósito.',
  );
}

// ── Perfis ──────────────────────────────────────────────────────────────────
//
// Espelham o eas.json. `instalavel` é a pergunta que importa na prática: dá para pegar o
// arquivo e pôr no aparelho, ou ele só serve para a loja?
const PERFIS = {
  development: {
    ambiente: 'development',
    instalavel: true,
    resumo: 'APK com cliente de desenvolvimento (exige `npx expo start` rodando).',
  },
  staging: {
    ambiente: 'staging',
    instalavel: true,
    resumo: 'APK autônomo apontando para a API de homologação.',
  },
  'producao-apk': {
    ambiente: 'production',
    instalavel: true,
    resumo: 'APK autônomo apontando para a API de produção. É o de testar no seu aparelho.',
  },
  production: {
    ambiente: 'production',
    instalavel: false,
    resumo: 'AAB para a Play Store. NÃO se instala direto no celular.',
  },
};

const PLATAFORMAS = ['android', 'ios', 'all'];

// ── Argumentos ──────────────────────────────────────────────────────────────

function lerArgumentos(argv) {
  const opcoes = {
    perfil: 'producao-apk',
    plataforma: 'android',
    api: null,
    local: false,
    esperar: false,
    mensagem: null,
    simular: false,
    ajuda: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const proximo = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) {
        throw new Error(`A opção ${arg} precisa de um valor.`);
      }
      i += 1;
      return v;
    };

    switch (arg) {
      case '--perfil': case '-e': opcoes.perfil = proximo(); break;
      case '--plataforma': case '-p': opcoes.plataforma = proximo(); break;
      case '--api': opcoes.api = proximo(); break;
      case '--mensagem': case '-m': opcoes.mensagem = validarMensagem(proximo()); break;
      case '--local': opcoes.local = true; break;
      case '--esperar': opcoes.esperar = true; break;
      case '--simular': opcoes.simular = true; break;
      case '--ajuda': case '-h': opcoes.ajuda = true; break;
      default:
        throw new Error(`Opção desconhecida: ${arg}. Use --ajuda para ver as disponíveis.`);
    }
  }

  return opcoes;
}

function mostrarAjuda() {
  console.log(`
Gera builds do Escala Fácil.

  npm run build -- [opções]

Opções
  -e, --perfil <nome>       ${Object.keys(PERFIS).join(' | ')}
                            padrão: producao-apk
  -p, --plataforma <nome>   ${PLATAFORMAS.join(' | ')}   (padrão: android)
      --api <url>           Sobrescreve a URL da API que vai dentro do binário.
  -m, --mensagem <texto>    Aparece na lista de builds do EAS.
      --local               Compila nesta máquina em vez de na nuvem
                            (exige Java e o SDK do Android instalados).
      --esperar             Fica preso no terminal até a build terminar.
      --simular             Roda todas as conferências e mostra o comando, sem construir.
  -h, --ajuda               Isto aqui.

Perfis
${Object.entries(PERFIS).map(([nome, p]) => `  ${nome.padEnd(14)} ${p.resumo}`).join('\n')}

Exemplos
  # O caso comum: APK instalável, apontando para produção
  npm run build -- --perfil producao-apk

  # Apontando para o backend da sua máquina, exposto por um túnel
  npm run build -- --perfil staging --api https://abc123.ngrok.io/api/v1

  # Só conferir o que aconteceria, sem gastar a fila
  npm run build -- --perfil production --simular
`);
}

// ── Conferências ────────────────────────────────────────────────────────────

const avisos = [];
const erros = [];

/**
 * O que de fato vai para dentro do binário, perguntado ao `app.config.ts`.
 *
 * Ler daqui em vez de repetir o mapeamento é o que impede este script de dar informação
 * desatualizada depois que alguém mexer no config.
 */
function lerConfigResolvida(ambiente, apiSobrescrita) {
  const env = { ...process.env, APP_ENV: ambiente };
  if (apiSobrescrita) env.API_URL = apiSobrescrita;

  const saida = spawnSync(
    process.execPath,
    [EXPO_CLI, 'config', '--type', 'public', '--json'],
    { env, encoding: 'utf8' },
  );

  if (saida.status !== 0) {
    erros.push('Não consegui ler a configuração do app (`expo config` falhou).');
    return null;
  }

  try {
    // O `expo config` às vezes imprime avisos antes do JSON; pega do primeiro `{`.
    const bruto = saida.stdout.slice(saida.stdout.indexOf('{'));
    return JSON.parse(bruto);
  } catch {
    erros.push('A configuração do app veio num formato que não consegui ler.');
    return null;
  }
}

function conferirLogin() {
  const saida = spawnSync(NPX, ['eas-cli', 'whoami'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  const texto = `${saida.stdout || ''}${saida.stderr || ''}`;
  if (saida.status !== 0 || /not logged in/i.test(texto)) {
    erros.push(
      'Sem conta Expo conectada. Rode `npx eas-cli login` primeiro '
      + '(a conta é gratuita; o build de Android entra numa fila compartilhada).',
    );
    return null;
  }

  return texto.trim().split('\n').pop().trim();
}

/**
 * A conferência que este script existe para fazer.
 *
 * Um domínio que não resolve produz um app que instala, abre e falha em toda requisição —
 * sem nenhuma pista de que o problema é a URL compilada dentro dele.
 */
async function conferirApi(url, ambiente) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    erros.push(`A URL da API não é válida: ${url}`);
    return;
  }

  if (host === '10.0.2.2' || host === 'localhost' || host === '127.0.0.1') {
    avisos.push(
      `A API aponta para ${host}, que só existe dentro do emulador ou da sua máquina. `
      + 'Num celular de verdade nenhuma requisição vai funcionar — use --api com um '
      + 'endereço alcançável pela rede do aparelho.',
    );
    return;
  }

  try {
    await lookup(host);
  } catch {
    erros.push(
      `O domínio da API não existe no DNS: ${host}\n`
      + `    O perfil "${ambiente}" aponta para ele, e um app compilado assim instala, abre\n`
      + '    e falha em toda requisição. Passe --api com um endereço que exista.',
    );
  }
}

function conferirArtefato(perfil, plataforma) {
  if (PERFIS[perfil].instalavel) return;
  if (plataforma === 'ios') return;

  avisos.push(
    `O perfil "${perfil}" gera um AAB, que NÃO se instala direto no celular — só a Play `
    + 'Store abre esse formato. Para testar no seu aparelho use --perfil producao-apk.',
  );
}

function conferirFerramentasLocais() {
  const java = spawnSync('java', ['-version']);
  if (java.status !== 0) {
    erros.push(
      'A opção --local precisa de Java e do SDK do Android instalados nesta máquina, '
      + 'e o `java` não foi encontrado. Sem a flag, a build roda na nuvem do EAS.',
    );
  }
}

// ── Execução ────────────────────────────────────────────────────────────────

/** Sai com mensagem de uso quando o pedido não faz sentido antes mesmo de conferir nada. */
function validarOpcoes(opcoes) {
  if (!PERFIS[opcoes.perfil]) {
    console.error(`✖ Perfil desconhecido: ${opcoes.perfil}`);
    console.error(`  Disponíveis: ${Object.keys(PERFIS).join(', ')}`);
    process.exit(2);
  }

  if (!PLATAFORMAS.includes(opcoes.plataforma)) {
    console.error(`✖ Plataforma desconhecida: ${opcoes.plataforma}`);
    console.error(`  Disponíveis: ${PLATAFORMAS.join(', ')}`);
    process.exit(2);
  }
}

/** Roda todas as conferências e devolve o que foi possível descobrir. */
async function conferirTudo(opcoes, perfil) {
  const config = lerConfigResolvida(perfil.ambiente, opcoes.api);
  const conta = opcoes.local ? null : conferirLogin();

  conferirArtefato(opcoes.perfil, opcoes.plataforma);
  if (opcoes.local) conferirFerramentasLocais();

  const apiUrl = config?.extra?.apiUrl;
  if (apiUrl) await conferirApi(apiUrl, perfil.ambiente);

  return { config, conta, apiUrl };
}

function mostrarResumo(opcoes, perfil, { config, conta, apiUrl }) {
  if (config) {
    const alvo = opcoes.plataforma === 'ios'
      ? config.ios?.bundleIdentifier
      : config.android?.package;
    console.log(`  aplicativo     ${config.name}`);
    console.log(`  identificador  ${alvo || '(não definido)'}`);
    console.log(`  versão         ${config.version}`);
    console.log(`  API            ${apiUrl}`);
  }
  console.log(`  perfil         ${opcoes.perfil} — ${perfil.resumo}`);
  console.log(`  plataforma     ${opcoes.plataforma}`);
  console.log(`  onde           ${opcoes.local ? 'nesta máquina' : 'nuvem do EAS'}`);
  if (conta) console.log(`  conta          ${conta}`);
}

/** Aviso não impede; impedimento encerra sem começar build nenhuma. */
function relatarAchados() {
  if (avisos.length) {
    console.log('\n── Atenção ────────────────────────────────────────────────────\n');
    for (const aviso of avisos) console.log(`  ⚠ ${aviso}\n`);
  }

  if (erros.length) {
    console.log('\n── Impedimentos ───────────────────────────────────────────────\n');
    for (const erro of erros) console.log(`  ✖ ${erro}\n`);
    console.log('  Nenhuma build foi iniciada.\n');
    process.exit(1);
  }
}

function montarArgumentos(opcoes) {
  const args = ['eas-cli', 'build', '--platform', opcoes.plataforma, '--profile', opcoes.perfil];

  if (opcoes.local) args.push('--local');
  args.push(opcoes.esperar ? '--wait' : '--no-wait');
  if (opcoes.mensagem) args.push('--message', opcoes.mensagem);

  return args;
}

function construir(opcoes, perfil, args) {
  console.log('\n── Construindo ────────────────────────────────────────────────\n');

  const env = { ...process.env, APP_ENV: perfil.ambiente };
  if (opcoes.api) env.API_URL = opcoes.api;

  const processo = spawn(NPX, args, {
    stdio: 'inherit',
    env,
    // Ver a nota em NPX: inevitável no Windows, e por isso a mensagem é validada na entrada.
    shell: process.platform === 'win32',
  });

  processo.on('exit', (codigo) => {
    if (codigo === 0 && !opcoes.esperar) {
      console.log(
        '\n✔ Build enfileirada. Acompanhe em https://expo.dev — quando terminar, o link do'
        + '\n  arquivo aparece lá, e no Android dá para instalar lendo o QR code direto do'
        + '\n  celular.\n',
      );
    }
    process.exit(codigo ?? 1);
  });
}

async function principal() {
  let opcoes;
  try {
    opcoes = lerArgumentos(process.argv.slice(2));
  } catch (erro) {
    console.error(`✖ ${erro.message}`);
    process.exit(2);
  }

  if (opcoes.ajuda) {
    mostrarAjuda();
    return;
  }

  validarOpcoes(opcoes);
  const perfil = PERFIS[opcoes.perfil];

  console.log('\n── Conferindo antes de gastar a fila ──────────────────────────\n');

  const achados = await conferirTudo(opcoes, perfil);
  mostrarResumo(opcoes, perfil, achados);
  relatarAchados();

  const args = montarArgumentos(opcoes);
  console.log(`\n  comando        npx ${args.join(' ')}`);
  if (opcoes.api) console.log(`  API_URL        ${opcoes.api}`);

  if (opcoes.simular) {
    console.log('\n✔ Simulação: tudo conferido, nada foi construído.\n');
    return;
  }

  construir(opcoes, perfil, args);
}

await principal();
