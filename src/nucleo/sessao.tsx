import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';

import { apiFetch, definirAccessToken, renovarSessao, registrarSaidaPorSessao } from './api';
import { armazenamentoSeguro } from './armazenamento';
import { identificarMembro } from '@/nucleo/observabilidade';

/**
 * Estado de sessão do aplicativo.
 *
 * Diferença de fundo em relação ao site: aqui a sessão precisa sobreviver ao app ser
 * FECHADO, não só a um recarregamento de página. Por isso a restauração na abertura lê o
 * cofre e renova antes de qualquer chamada — sem isso, a primeira requisição sairia sem
 * autorização só para tomar 401 e renovar, custando uma ida e volta em toda abertura.
 */
type Membro = { id: string; name?: string; role: string; permissions?: Record<string, boolean> } | null;
type Organizacao = {
  id: string;
  name: string;
  plan?: string;
  billing_status?: string;
  // Whitelist do backend (pickPublicTenantSettings). O fuso da escala mora aqui, e é o que
  // decide em que dia um turno da noite aparece.
  settings?: { timezone?: unknown } | null;
} | null;
type Usuario = { id: string; email: string } | null;

type EstadoSessao = {
  carregando: boolean;
  autenticado: boolean;
  membro: Membro;
  organizacao: Organizacao;
  usuario: Usuario;
  capacidades: Record<string, boolean>;
  entrar: (email: string, senha: string) => Promise<void>;
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
};

const Contexto = createContext<EstadoSessao | null>(null);

type RespostaAuth = {
  accessToken: string;
  refreshToken?: string;
  data?: {
    user?: Usuario;
    member?: Membro;
    organization?: Organizacao;
    capabilities?: Record<string, boolean>;
  };
};

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [membro, setMembro] = useState<Membro>(null);
  const [organizacao, setOrganizacao] = useState<Organizacao>(null);
  const [usuario, setUsuario] = useState<Usuario>(null);
  const [capacidades, setCapacidades] = useState<Record<string, boolean>>({});

  const limpar = useCallback(async () => {
    definirAccessToken(null);
    await armazenamentoSeguro.apagarRefresh();
    setMembro(null);
    setOrganizacao(null);
    setUsuario(null);
    setCapacidades({});
    identificarMembro(null);
  }, []);

  const carregarPerfil = useCallback(async () => {
    const res = await apiFetch<{ data: NonNullable<RespostaAuth['data']> }>('/auth/me');
    setMembro(res.data?.member ?? null);
    setOrganizacao(res.data?.organization ?? null);
    setUsuario(res.data?.user ?? null);
    setCapacidades(res.data?.capabilities ?? {});
    identificarMembro(res.data?.member?.id ?? null);
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
    setUsuario(res.data?.user ?? null);
    setCapacidades(res.data?.capabilities ?? {});
    identificarMembro(res.data?.member?.id ?? null);
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
    usuario,
    capacidades,
    entrar,
    recarregarPerfil: carregarPerfil,
    sair,
  }), [carregando, membro, organizacao, usuario, capacidades, entrar, carregarPerfil, sair]);

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
