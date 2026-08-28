import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';

import { apiFetch, definirAccessToken, renovarSessao, registrarSaidaPorSessao } from './api';
import { armazenamentoSeguro } from './armazenamento';

/**
 * Estado de sessão do aplicativo.
 *
 * Diferença de fundo em relação ao site: aqui a sessão precisa sobreviver ao app ser
 * FECHADO, não só a um recarregamento de página. Por isso a restauração na abertura lê o
 * cofre e renova antes de qualquer chamada — sem isso, a primeira requisição sairia sem
 * autorização só para tomar 401 e renovar, custando uma ida e volta em toda abertura.
 */
type Membro = { id: string; role: string; tenant_id?: string } | null;
type Organizacao = { id: string; name: string; billing_status?: string } | null;

type EstadoSessao = {
  carregando: boolean;
  autenticado: boolean;
  membro: Membro;
  organizacao: Organizacao;
  capacidades: Record<string, boolean>;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
};

const Contexto = createContext<EstadoSessao | null>(null);

type RespostaAuth = {
  accessToken: string;
  refreshToken?: string;
  data?: {
    member?: Membro;
    organization?: Organizacao;
    capabilities?: Record<string, boolean>;
  };
};

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [membro, setMembro] = useState<Membro>(null);
  const [organizacao, setOrganizacao] = useState<Organizacao>(null);
  const [capacidades, setCapacidades] = useState<Record<string, boolean>>({});

  const limpar = useCallback(async () => {
    definirAccessToken(null);
    await armazenamentoSeguro.apagarRefresh();
    setMembro(null);
    setOrganizacao(null);
    setCapacidades({});
  }, []);

  const carregarPerfil = useCallback(async () => {
    const res = await apiFetch<{ data: NonNullable<RespostaAuth['data']> }>('/auth/me');
    setMembro(res.data?.member ?? null);
    setOrganizacao(res.data?.organization ?? null);
    setCapacidades(res.data?.capabilities ?? {});
  }, []);

  // O cliente HTTP não navega sozinho: avisa, e a navegação decide.
  useEffect(() => {
    registrarSaidaPorSessao(() => {
      void limpar();
      router.replace('/entrar');
    });
  }, [limpar]);

  // Restauração na abertura.
  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const token = await renovarSessao();
        if (!token) return;
        if (!cancelado) await carregarPerfil();
      } catch {
        // Sem rede na abertura: fica deslogado nesta sessão, mas o cofre NÃO é limpo —
        // o token continua válido e a próxima abertura com sinal recupera.
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => { cancelado = true; };
  }, [carregarPerfil]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const res = await apiFetch<RespostaAuth>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: senha }),
    });

    definirAccessToken(res.accessToken);
    if (res.refreshToken) await armazenamentoSeguro.gravarRefresh(res.refreshToken);

    setMembro(res.data?.member ?? null);
    setOrganizacao(res.data?.organization ?? null);
    setCapacidades(res.data?.capabilities ?? {});
  }, []);

  const sair = useCallback(async () => {
    const refresh = await armazenamentoSeguro.lerRefresh();
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
      });
    } catch {
      // Falhar ao avisar o servidor não pode impedir a saída local.
    }
    await limpar();
    router.replace('/entrar');
  }, [limpar]);

  const valor = useMemo<EstadoSessao>(() => ({
    carregando,
    autenticado: Boolean(membro),
    membro,
    organizacao,
    capacidades,
    entrar,
    sair,
  }), [carregando, membro, organizacao, capacidades, entrar, sair]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): EstadoSessao {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useSessao precisa estar dentro de SessaoProvider.');
  return ctx;
}

/** Capacidade vinda do backend — nunca checar plano ou papel direto na tela. */
export function usePodeVer(chave: string): boolean {
  const { capacidades } = useSessao();
  return capacidades[chave] === true;
}
