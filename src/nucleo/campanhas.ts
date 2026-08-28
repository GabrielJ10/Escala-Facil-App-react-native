/**
 * As regras da fila de comunicados do fundador.
 *
 * O site tem isso em `ModalCampaignHost` + `useReusableModalQueue`, ~500 linhas com teste.
 * Aqui as REGRAS são reimplementadas em funções puras e a apresentação é própria — a
 * alternativa seria mover a fila para o contrato compartilhado, o que exigiria mexer no
 * site, e o plano fixou `format.ts` como a única mudança lá.
 *
 * O preço dessa escolha é real: duas implementações da mesma regra. O que a torna aceitável
 * é que as regras são poucas, estão todas neste arquivo, e cada uma tem teste que descreve
 * o comportamento esperado — se o site mudar, a diferença aparece na leitura do teste, não
 * num defeito em produção.
 */
import { rotaDoCaminhoDoSite, type RotaDoApp } from './rotas-do-push';

export type ModoDeExibicao = 'SHOW_ONCE' | 'SHOW_ALWAYS';

export type CampanhaDaApi = {
  id: string;
  key?: string;
  name?: string;
  priority?: number;
  display_mode?: string;
  content?: {
    title?: string;
    body?: string;
    html?: string;
    image_url?: string;
    cta_label?: string;
    cta_path?: string;
  } | null;
};

export type ComunicadoNoApp = {
  id: string;
  chave: string;
  titulo: string;
  corpo: string;
  imagem: string | null;
  rotuloDoBotao: string;
  destino: RotaDoApp | null;
  modo: ModoDeExibicao;
};

/** Qualquer coisa que não seja exatamente SHOW_ONCE é tratada como SHOW_ALWAYS. */
export function normalizarModoDeExibicao(bruto: string | null | undefined): ModoDeExibicao {
  return String(bruto || '').trim().toUpperCase() === 'SHOW_ONCE' ? 'SHOW_ONCE' : 'SHOW_ALWAYS';
}

/**
 * Menor prioridade primeiro — é a convenção do backend (`priority` com padrão 100).
 *
 * O desempate é pelo id, e não é capricho: sem ele, duas campanhas de mesma prioridade
 * trocariam de ordem entre recargas, e o comunicado que a pessoa fechou reapareceria na
 * frente do outro.
 */
export function ordenarPorPrioridade(campanhas: CampanhaDaApi[]): CampanhaDaApi[] {
  return [...(campanhas || [])].sort((a, b) => {
    const pa = Number(a?.priority ?? 9999);
    const pb = Number(b?.priority ?? 9999);
    if (pa !== pb) return pa - pb;
    return String(a?.id).localeCompare(String(b?.id));
  });
}

const CORPO_PADRAO = 'Temos uma atualização importante para você.';

/**
 * Converte o que a API devolve no que a tela mostra.
 *
 * **O `html` é descartado de propósito.** O site o renderiza num iframe com sandbox, que é
 * a segunda camada de defesa sobre a sanitização do servidor. React Native não tem iframe:
 * exibir aquele HTML exigiria uma WebView, que é uma dependência a mais, sem sandbox
 * equivalente, e dentro de um modal — exatamente o que o app foi feito para não ser.
 *
 * Quando só existe `html`, o corpo cai no texto padrão. É pior que o site nesse caso, e é a
 * troca consciente: comunicado com formatação vira comunicado simples, em vez de virar
 * superfície de execução de HTML de terceiros num app instalado.
 */
export function paraComunicadoDoApp(campanha: CampanhaDaApi): ComunicadoNoApp {
  const conteudo = campanha?.content ?? {};

  const destino = rotaDoCaminhoDoSite(conteudo.cta_path);
  const rotuloEscolhido = String(conteudo.cta_label || '').trim();

  return {
    id: campanha.id,
    chave: String(campanha.key || '').trim(),
    titulo: String(conteudo.title || campanha.name || 'Comunicado').trim(),
    corpo: String(conteudo.body || '').trim() || CORPO_PADRAO,
    imagem: String(conteudo.image_url || '').trim() || null,
    // Sem destino, o botão fecha em vez de navegar — e o rótulo precisa dizer isso.
    rotuloDoBotao: rotuloEscolhido || (destino ? 'Abrir' : 'Entendi'),
    destino,
    modo: normalizarModoDeExibicao(campanha.display_mode),
  };
}

/**
 * A fila pronta para a tela: ordenada, traduzida e sem o que já foi escondido nesta sessão.
 *
 * "Escondido na sessão" é diferente de "dispensado": dispensar vai ao servidor e vale para
 * sempre; esconder vive só na memória desta execução do app, e é o que faz o comunicado não
 * voltar imediatamente depois de fechado quando a lista é recarregada.
 */
export function montarFila(
  campanhas: CampanhaDaApi[],
  escondidas: ReadonlySet<string>,
): ComunicadoNoApp[] {
  return ordenarPorPrioridade(campanhas)
    .filter((c) => c?.id && !escondidas.has(String(c.id)))
    .map(paraComunicadoDoApp);
}

export type AcaoAoFechar = 'dispensar-no-servidor' | 'esconder-na-sessao';

/**
 * O que fazer quando a pessoa fecha o modal sem tocar no botão.
 *
 * A diferença entre os dois modos é o ponto inteiro de existirem:
 *
 *   - **SHOW_ONCE**: fechar é "já vi". Persiste no servidor e nunca mais aparece — reexibir
 *     um comunicado único a cada abertura seria o app repetindo o mesmo recado, que é a
 *     forma mais rápida de ensinar alguém a fechar sem ler.
 *   - **SHOW_ALWAYS**: fechar vale só para esta sessão. Volta na próxima abertura, que é o
 *     que o fundador pediu ao escolher esse modo.
 */
export function acaoAoFechar(modo: ModoDeExibicao): AcaoAoFechar {
  return modo === 'SHOW_ONCE' ? 'dispensar-no-servidor' : 'esconder-na-sessao';
}
