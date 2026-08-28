import { API_URL, VERSAO_APP } from './ambiente';
import { armazenamentoSeguro } from './armazenamento';

/**
 * Cliente HTTP do aplicativo.
 *
 * DIVERGE do `api.ts` do site de propósito — ver docs/divergencias-app-web.md. As três
 * diferenças, e o motivo de cada uma:
 *
 *   1. O refresh vive no Keychain/Keystore, não em cookie httpOnly. O app não tem cookie
 *      httpOnly; o cofre do sistema é o equivalente dele.
 *   2. O token vai e volta no CORPO, com o cabeçalho `X-Client-Type: mobile`. O servidor só
 *      devolve o refresh no corpo quando o cliente se declara app.
 *   3. Sessão perdida não redireciona para `/login` — avisa quem escuta, e a navegação
 *      decide. `window.location` não existe aqui.
 *
 * O que NÃO diverge: o access token continua só em memória, e o refresh continua
 * single-flight. Este último é reescrito aqui e tem teste próprio, porque não vem no
 * contrato compartilhado.
 */

let accessToken: string | null = null;
let promessaDeRenovacao: Promise<string | null> | null = null;

type AoPerderSessao = () => void;
let aoPerderSessao: AoPerderSessao = () => {};

/** A navegação registra o que fazer quando a sessão acaba — o cliente não navega sozinho. */
export function registrarSaidaPorSessao(callback: AoPerderSessao) {
  aoPerderSessao = callback;
}

export function definirAccessToken(token: string | null) {
  accessToken = token;
}

export function lerAccessToken(): string | null {
  return accessToken;
}

export type ErroApi = Error & {
  status?: number;
  corpo?: unknown;
};

/**
 * O último erro de API, para a tela de diagnóstico.
 *
 * Uma linha só, e de propósito: quem relata um problema descreve o que viu, não quando. Com
 * o horário e o status ao lado da rota, "deu erro ontem" vira uma requisição localizável no
 * log do servidor.
 *
 * Guarda a ROTA, nunca o corpo: a resposta pode conter nome, e-mail e escala de terceiros, e
 * esta tela existe para ser copiada e colada numa conversa de suporte.
 */
let ultimoErro: { quando: string; rota: string; status: number } | null = null;

export function lerUltimoErro() {
  return ultimoErro;
}

function erroDe(mensagem: string, status: number, corpo?: unknown): ErroApi {
  const e = new Error(mensagem) as ErroApi;
  e.status = status;
  e.corpo = corpo;
  return e;
}

function mensagemAmigavel(corpo: unknown, status: number): string {
  const doServidor = (corpo as { message?: string })?.message;
  if (typeof doServidor === 'string' && doServidor.trim()) return doServidor;

  const porStatus: Record<number, string> = {
    400: 'Dados inválidos. Revise e tente de novo.',
    401: 'Sua sessão expirou. Entre novamente.',
    402: 'Este recurso está indisponível no momento.',
    403: 'Você não tem permissão para isso.',
    404: 'Não encontramos o que você procura.',
    409: 'Esta ação conflita com algo que já existe.',
    429: 'Muitas tentativas. Aguarde alguns instantes.',
    500: 'Tivemos um problema. Tente novamente em instantes.',
  };
  return porStatus[status] || 'Não foi possível concluir a operação.';
}

/**
 * Renova o par de tokens. Single-flight de verdade: chamadas concorrentes compartilham a
 * MESMA promessa, liberada só no `finally`.
 *
 * Sem isso, o retorno do segundo plano dispara várias renovações ao mesmo tempo — e com
 * rotação no servidor, a segunda invalida a primeira e a sessão cai. É o mesmo defeito que
 * o site já teve.
 */
export function renovarSessao(): Promise<string | null> {
  if (promessaDeRenovacao) return promessaDeRenovacao;

  promessaDeRenovacao = (async () => {
    const refresh = await armazenamentoSeguro.lerRefresh();
    if (!refresh) return null;

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Type': 'mobile',
          'X-App-Version': VERSAO_APP,
        },
        body: JSON.stringify({ refreshToken: refresh }),
      });

      if (!res.ok) {
        // 401 aqui é sessão morta de verdade: o cofre precisa ser limpo, senão o app
        // insiste num token que o servidor já rejeitou.
        if (res.status === 401) await armazenamentoSeguro.apagarRefresh();
        return null;
      }

      const dados = await res.json();
      definirAccessToken(dados.accessToken ?? null);
      if (dados.refreshToken) await armazenamentoSeguro.gravarRefresh(dados.refreshToken);
      return accessToken;
    } catch {
      // Falha de rede NÃO derruba a sessão: sem sinal, o token continua válido e o cache
      // continua servindo. Quem trata isso é a tela, não o cliente.
      return null;
    }
  })().finally(() => {
    promessaDeRenovacao = null;
  });

  return promessaDeRenovacao;
}

const ROTAS_SEM_RENOVACAO = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

export async function apiFetch<T = unknown>(
  rota: string,
  opcoes: RequestInit = {},
): Promise<T> {
  const executar = async (): Promise<Response> => {
    const cabecalhos: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-Type': 'mobile',
      'X-App-Version': VERSAO_APP,
      ...(opcoes.headers as Record<string, string> | undefined),
    };

    if (accessToken) cabecalhos.Authorization = `Bearer ${accessToken}`;

    return fetch(`${API_URL}${rota}`, { ...opcoes, headers: cabecalhos });
  };

  let res = await executar();

  const podeRenovar = res.status === 401
    && !ROTAS_SEM_RENOVACAO.some((r) => rota.startsWith(r));

  if (podeRenovar) {
    const novo = await renovarSessao();
    if (novo) {
      res = await executar();
    } else {
      aoPerderSessao();
      ultimoErro = { quando: new Date().toISOString(), rota, status: 401 };
      throw erroDe('Sua sessão expirou. Entre novamente.', 401);
    }
  }

  if (!res.ok) {
    let corpo: unknown = null;
    try { corpo = await res.json(); } catch { /* resposta sem corpo */ }
    ultimoErro = { quando: new Date().toISOString(), rota, status: res.status };
    throw erroDe(mensagemAmigavel(corpo, res.status), res.status, corpo);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
