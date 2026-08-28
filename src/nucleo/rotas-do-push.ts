/**
 * Traduz o destino de uma notificação para uma rota do aplicativo.
 *
 * DIVERGE do site — ver docs/divergencias-app-web.md.
 *
 * O backend guarda `target_path` como caminho do site (`/dashboard/trocas`), porque foi ele
 * quem existiu primeiro. O app tem outra árvore de navegação, então precisa traduzir. Sem
 * isso, notificação de uma versão mais nova do servidor abre nada num app antigo — o bug
 * clássico de push, e o mais difícil de perceber, porque não gera erro: o usuário toca, o
 * app abre na tela inicial, e ninguém reporta.
 *
 * Dois cuidados que o site não precisa ter:
 *
 * **Caminho desconhecido cai na tela inicial**, nunca em erro. O servidor pode ganhar
 * destinos novos a qualquer deploy, e o app instalado não sabe deles.
 *
 * **Cobrança nunca abre paywall.** Oito `target_path` do backend apontam para
 * `/dashboard/settings?tab=billing`. Um push de "sua assinatura venceu" que abrisse tela de
 * preço dentro do app é exatamente o que a regra 3.1.3(f) da Apple reprova — e é ruído para
 * o funcionário, que não é quem paga.
 */

/** Onde o app pode abrir a partir de uma notificação. */
export type RotaDoApp =
  | '/minha-escala'
  | '/trocas'
  | '/afastamentos'
  | '/solicitacoes'
  | '/notificacoes'
  | '/indisponivel';

const INICIAL: RotaDoApp = '/minha-escala';

/**
 * Caminho do site → rota do app.
 *
 * As chaves são caminhos SEM query string: `/dashboard/settings?tab=billing` e
 * `/dashboard/settings?tab=perfil` são o mesmo destino para o app.
 */
const POR_CAMINHO: Record<string, RotaDoApp> = {
  '/dashboard/escala': '/minha-escala',
  '/dashboard/trocas': '/trocas',
  '/dashboard/afastamentos': '/afastamentos',
  '/dashboard/admin/requests': '/solicitacoes',

  // Cobrança vai para a tela neutra, sem preço e sem link para a loja.
  '/dashboard/settings': '/indisponivel',
};

/**
 * Destino padrão por categoria, quando a notificação não traz caminho.
 *
 * Espelha `NOTIFICATION_CATEGORY_DEFAULT_TARGETS` do site — as categorias vêm do backend e
 * são as mesmas nos dois.
 */
const POR_CATEGORIA: Record<string, RotaDoApp> = {
  pending_admin_requests: '/solicitacoes',
  pending_absence_requests: '/solicitacoes',
  absence_request_result: '/afastamentos',
  shift_swap: '/trocas',
  schedule_alerts: '/minha-escala',
  BILLING: '/indisponivel',
};

/** Descarta query string e âncora — o app roteia por caminho. */
function apenasCaminho(bruto: string): string {
  const valor = String(bruto || '').trim();
  if (!valor.startsWith('/')) return '';
  return valor.split('?')[0].split('#')[0];
}

export type NotificacaoParaRota = {
  category?: string | null;
  metadata?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
};

/**
 * A rota que a notificação deve abrir.
 *
 * Procura na mesma ordem do site: primeiro o caminho explícito na metadata, depois o padrão
 * da categoria. O que muda é o desfecho — aqui, não achar nada leva à tela inicial em vez de
 * devolver nulo, porque o app SEMPRE precisa abrir em algum lugar.
 */
export function rotaDaNotificacao(notificacao: NotificacaoParaRota): RotaDoApp {
  const fonte = notificacao?.metadata ?? notificacao?.data ?? {};

  const candidatos = [
    fonte.target_path,
    fonte.action_path,
    fonte.path,
    fonte.route,
    fonte.deep_link,
    fonte.target_url,
  ];

  for (const candidato of candidatos) {
    if (typeof candidato !== 'string') continue;
    const caminho = apenasCaminho(candidato);
    const rota = POR_CAMINHO[caminho];
    if (rota) return rota;
  }

  const porCategoria = POR_CATEGORIA[String(notificacao?.category || '').trim()];
  if (porCategoria) return porCategoria;

  return INICIAL;
}

/**
 * O destino é o bloqueio neutro?
 *
 * A tela de navegação usa isto para não empilhar `/indisponivel` sobre uma sessão que está
 * funcionando — se o acesso está normal, o aviso de cobrança não deve interromper.
 */
export function ehDestinoDeCobranca(rota: RotaDoApp): boolean {
  return rota === '/indisponivel';
}
