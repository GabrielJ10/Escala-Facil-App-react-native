/**
 * As regras da fila de comunicados.
 *
 * São as mesmas do site, reimplementadas aqui porque o plano fixou `format.ts` como a única
 * mudança no repositório do site. O preço é ter duas implementações da mesma coisa; estes
 * testes são o que torna esse preço aceitável — descrevem o comportamento esperado, então
 * uma divergência futura aparece na leitura, não como defeito em produção.
 */
import { describe, expect, it } from 'vitest';

import {
  acaoAoFechar,
  montarFila,
  normalizarModoDeExibicao,
  ordenarPorPrioridade,
  paraComunicadoDoApp,
} from '@/nucleo/campanhas';

describe('normalizarModoDeExibicao', () => {
  it('reconhece SHOW_ONCE em qualquer caixa e com espaços', () => {
    expect(normalizarModoDeExibicao('SHOW_ONCE')).toBe('SHOW_ONCE');
    expect(normalizarModoDeExibicao(' show_once ')).toBe('SHOW_ONCE');
  });

  /**
   * Tudo que não é exatamente SHOW_ONCE vira SHOW_ALWAYS, e o padrão está do lado seguro:
   * um comunicado que reaparece é irritante; um que some sem ninguém ter visto é uma
   * campanha perdida que o fundador nunca vai saber que perdeu.
   */
  it('qualquer outra coisa vira SHOW_ALWAYS', () => {
    expect(normalizarModoDeExibicao('SHOW_ALWAYS')).toBe('SHOW_ALWAYS');
    expect(normalizarModoDeExibicao('MODO_NOVO')).toBe('SHOW_ALWAYS');
    expect(normalizarModoDeExibicao(null)).toBe('SHOW_ALWAYS');
    expect(normalizarModoDeExibicao(undefined)).toBe('SHOW_ALWAYS');
  });
});

describe('ordenarPorPrioridade', () => {
  it('menor prioridade primeiro — é a convenção do backend', () => {
    const ordenadas = ordenarPorPrioridade([
      { id: 'c', priority: 300 },
      { id: 'a', priority: 10 },
      { id: 'b', priority: 100 },
    ]);
    expect(ordenadas.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  /**
   * Sem desempate, duas campanhas de mesma prioridade trocariam de ordem entre recargas —
   * e o comunicado que a pessoa acabou de fechar voltaria para a frente do outro.
   */
  it('empate desempata pelo id, e a ordem é estável', () => {
    const entrada = [{ id: 'z', priority: 50 }, { id: 'a', priority: 50 }];
    expect(ordenarPorPrioridade(entrada).map((c) => c.id)).toEqual(['a', 'z']);
    expect(ordenarPorPrioridade([...entrada].reverse()).map((c) => c.id)).toEqual(['a', 'z']);
  });

  it('sem prioridade vai para o fim', () => {
    const ordenadas = ordenarPorPrioridade([{ id: 'sem' }, { id: 'com', priority: 100 }]);
    expect(ordenadas.map((c) => c.id)).toEqual(['com', 'sem']);
  });

  it('não altera o array recebido', () => {
    const entrada = [{ id: 'b', priority: 2 }, { id: 'a', priority: 1 }];
    ordenarPorPrioridade(entrada);
    expect(entrada.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('paraComunicadoDoApp', () => {
  it('usa o conteúdo quando ele existe', () => {
    const c = paraComunicadoDoApp({
      id: '1',
      key: 'natal',
      name: 'Campanha de Natal',
      content: {
        title: 'Boas festas',
        body: 'A escala de dezembro já está no ar.',
        cta_label: 'Ver escala',
        cta_path: '/dashboard/escala',
      },
    });

    expect(c.titulo).toBe('Boas festas');
    expect(c.corpo).toBe('A escala de dezembro já está no ar.');
    expect(c.rotuloDoBotao).toBe('Ver escala');
    expect(c.destino).toBe('/minha-escala');
  });

  it('sem título usa o nome da campanha', () => {
    expect(paraComunicadoDoApp({ id: '1', name: 'Aviso' }).titulo).toBe('Aviso');
  });

  it('sem nome nem título tem um rótulo genérico, nunca vazio', () => {
    expect(paraComunicadoDoApp({ id: '1' }).titulo).toBe('Comunicado');
  });

  /**
   * O `html` é descartado de propósito: o site o renderiza num iframe com sandbox, e o React
   * Native não tem iframe. Exibi-lo exigiria WebView — sem sandbox equivalente, dentro de um
   * modal, num app instalado.
   *
   * A consequência é esta: campanha só com HTML cai no texto padrão em vez de aparecer vazia.
   */
  it('campanha só com HTML cai no texto padrão, e não expõe o HTML', () => {
    const c = paraComunicadoDoApp({
      id: '1',
      content: { html: '<b>Promoção</b><script>alert(1)</script>' },
    });

    expect(c.corpo).toBe('Temos uma atualização importante para você.');
    expect(JSON.stringify(c)).not.toContain('script');
    expect(JSON.stringify(c)).not.toContain('<b>');
  });

  it('sem destino o botão diz "Entendi", porque ele só fecha', () => {
    expect(paraComunicadoDoApp({ id: '1' }).rotuloDoBotao).toBe('Entendi');
    expect(paraComunicadoDoApp({ id: '1' }).destino).toBeNull();
  });

  it('com destino conhecido e sem rótulo, o botão diz "Abrir"', () => {
    const c = paraComunicadoDoApp({ id: '1', content: { cta_path: '/dashboard/trocas' } });
    expect(c.destino).toBe('/trocas');
    expect(c.rotuloDoBotao).toBe('Abrir');
  });

  /**
   * Caminho que o app não conhece NÃO vira navegação.
   *
   * Diferente do push, que sempre precisa abrir em algum lugar: aqui, levar a pessoa a uma
   * tela que não tem nada a ver com o comunicado é pior que só fechar.
   */
  it('caminho desconhecido não vira destino', () => {
    const c = paraComunicadoDoApp({
      id: '1',
      content: { cta_path: '/dashboard/relatorios/novo' },
    });
    expect(c.destino).toBeNull();
    expect(c.rotuloDoBotao).toBe('Entendi');
  });

  it('link externo é ignorado — comunicado não leva para fora', () => {
    expect(paraComunicadoDoApp({
      id: '1',
      content: { cta_path: 'https://outro-site.com/promo' },
    }).destino).toBeNull();
  });

  /**
   * O mesmo cuidado do push, pelo mesmo motivo: um comunicado com botão que leva à tela de
   * cobrança é a regra 3.1.3(f) da Apple sendo desrespeitada por outro caminho.
   *
   * A tradução aponta para `/indisponivel`, e quem renderiza confere `ehDestinoDeCobranca`
   * antes de navegar.
   */
  it('destino de cobrança é a tela neutra, nunca uma tela de preço', () => {
    expect(paraComunicadoDoApp({
      id: '1',
      content: { cta_path: '/dashboard/settings?tab=billing' },
    }).destino).toBe('/indisponivel');
  });

  it('imagem vazia vira nulo, para a tela não tentar carregar string vazia', () => {
    expect(paraComunicadoDoApp({ id: '1', content: { image_url: '   ' } }).imagem).toBeNull();
    expect(paraComunicadoDoApp({ id: '1' }).imagem).toBeNull();
  });
});

describe('montarFila', () => {
  const campanhas = [
    { id: 'b', priority: 200, content: { title: 'Segunda' } },
    { id: 'a', priority: 100, content: { title: 'Primeira' } },
  ];

  it('ordena e traduz', () => {
    const fila = montarFila(campanhas, new Set());
    expect(fila.map((c) => c.titulo)).toEqual(['Primeira', 'Segunda']);
  });

  it('tira o que já foi escondido nesta sessão', () => {
    const fila = montarFila(campanhas, new Set(['a']));
    expect(fila.map((c) => c.id)).toEqual(['b']);
  });

  it('esconder tudo devolve fila vazia, não um item quebrado', () => {
    expect(montarFila(campanhas, new Set(['a', 'b']))).toEqual([]);
  });

  it('campanha sem id é descartada', () => {
    const fila = montarFila([{ id: '' }, ...campanhas], new Set());
    expect(fila).toHaveLength(2);
  });

  it('lista vazia devolve fila vazia', () => {
    expect(montarFila([], new Set())).toEqual([]);
  });
});

describe('acaoAoFechar', () => {
  /**
   * A diferença entre os dois modos é o ponto inteiro de eles existirem.
   *
   * Se SHOW_ONCE deixar de persistir, o comunicado único volta a cada abertura — a forma
   * mais rápida de ensinar alguém a fechar sem ler. Se SHOW_ALWAYS passar a persistir, o
   * fundador perde a campanha recorrente que pediu.
   */
  it('SHOW_ONCE persiste no servidor', () => {
    expect(acaoAoFechar('SHOW_ONCE')).toBe('dispensar-no-servidor');
  });

  it('SHOW_ALWAYS vale só para esta sessão', () => {
    expect(acaoAoFechar('SHOW_ALWAYS')).toBe('esconder-na-sessao');
  });
});
