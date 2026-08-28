/**
 * As decisões de apresentação.
 *
 * São funções pequenas, e é justamente por isso que valem teste: cada uma decide algo que
 * ninguém revisa depois — o texto que aparece num erro, se um botão existe, se um formulário
 * pode ser enviado. Erram em silêncio e só aparecem em campo.
 */
import { describe, expect, it } from 'vitest';

import {
  agruparTurnosPorDia,
  contarNaoLidas,
  mensagemDeErro,
  naoFoiLida,
  podeResponderTroca,
  rotuloDaSituacaoDaTroca,
  rotuloDaSituacaoDoAfastamento,
  trocaEstaAberta,
  validarPedidoDeAfastamento,
} from '@/nucleo/apresentacao';

function erroCom(status?: number, mensagem = 'algo') {
  return Object.assign(new Error(mensagem), { status });
}

describe('mensagemDeErro', () => {
  it('402 fala com o gestor, e não oferece retentativa', () => {
    const m = mensagemDeErro(erroCom(402));
    expect(m.tipo).toBe('assinatura');
    expect(m.detalhe).toContain('gestor');
    // Não adianta tentar de novo: a assinatura não volta em três segundos.
    expect(m.podeTentarDeNovo).toBe(false);
  });

  /**
   * O teste que protege a submissão na App Store.
   *
   * A regra 3.1.3(f) permite entregar conteúdo comprado fora — desde que o app não venda nem
   * direcione para venda. Uma palavra sobre preço ou plano nesta mensagem, que é a que o
   * funcionário vê quando o gestor atrasa o pagamento, transforma o app em vitrine.
   *
   * Falha aqui significa: alguém achou que estava melhorando a mensagem e reprovou a
   * submissão.
   */
  it('a mensagem de 402 não vende nada', () => {
    const { titulo, detalhe } = mensagemDeErro(erroCom(402));
    const texto = `${titulo} ${detalhe}`.toLowerCase();

    for (const proibida of [
      'assinar', 'assinatura', 'plano', 'pagar', 'pagamento', 'preço', 'preco',
      'r$', 'upgrade', 'renovar', 'comprar', 'loja', 'cartão', 'cartao',
    ]) {
      expect(texto, `a palavra "${proibida}" não pode aparecer`).not.toContain(proibida);
    }
  });

  it('403 diz que falta permissão, e também não oferece retentativa', () => {
    const m = mensagemDeErro(erroCom(403));
    expect(m.tipo).toBe('permissao');
    expect(m.podeTentarDeNovo).toBe(false);
  });

  it('erro sem status é falta de rede, e diz que o cache continua valendo', () => {
    const m = mensagemDeErro(new Error('Network request failed'));
    expect(m.tipo).toBe('rede');
    expect(m.titulo).toBe('Sem conexão');
    expect(m.detalhe).toContain('já foi carregado');
    expect(m.podeTentarDeNovo).toBe(true);
  });

  it('erro comum mostra o que o servidor disse', () => {
    const m = mensagemDeErro(erroCom(409, 'Este turno já foi preenchido.'));
    expect(m.tipo).toBe('generico');
    expect(m.detalhe).toBe('Este turno já foi preenchido.');
  });

  it('mensagem em branco do servidor cai no texto padrão', () => {
    const m = mensagemDeErro(erroCom(500, '   '));
    expect(m.detalhe).toBe('Tente novamente em instantes.');
  });

  it('nulo e indefinido não quebram — viram falta de rede', () => {
    expect(mensagemDeErro(null).tipo).toBe('rede');
    expect(mensagemDeErro(undefined).tipo).toBe('rede');
  });
});

describe('rótulos de situação', () => {
  it.each([
    ['PENDING_TARGET_ACCEPTANCE', 'Esperando você'],
    ['TARGET_ACCEPTED', 'Esperando o gestor'],
    ['PENDING_ADMIN_APPROVAL', 'Esperando o gestor'],
    ['EXECUTED', 'Concluída'],
    ['EXPIRED', 'Expirada'],
  ])('troca %s vira "%s"', (status, esperado) => {
    expect(rotuloDaSituacaoDaTroca(status)).toBe(esperado);
  });

  it('situação que o app não conhece não mostra o código cru do banco', () => {
    // O backend pode ganhar estados novos; "QUEUED_PENDING_CONFLICT" na tela é vazamento.
    expect(rotuloDaSituacaoDaTroca('ESTADO_QUE_AINDA_NAO_EXISTE')).toBe('Em andamento');
    expect(rotuloDaSituacaoDaTroca(null)).toBe('Em andamento');
  });

  it('separa troca aberta de encerrada', () => {
    expect(trocaEstaAberta('PENDING_TARGET_ACCEPTANCE')).toBe(true);
    expect(trocaEstaAberta('TARGET_ACCEPTED')).toBe(true);
    expect(trocaEstaAberta('EXECUTED')).toBe(false);
    expect(trocaEstaAberta('CANCELLED')).toBe(false);
  });

  it('afastamento desconhecido cai em "Em análise"', () => {
    expect(rotuloDaSituacaoDoAfastamento('APPROVED')).toBe('Aprovado');
    expect(rotuloDaSituacaoDoAfastamento('SEI_LA')).toBe('Em análise');
  });
});

describe('podeResponderTroca', () => {
  const AGORA = new Date('2026-08-28T12:00:00Z');
  const EU = 'membro-1';

  const base = {
    status: 'PENDING_TARGET_ACCEPTANCE',
    target: { id: EU },
    expires_at: '2026-08-30T12:00:00Z',
  };

  it('sou o alvo, está pendente e dentro do prazo', () => {
    expect(podeResponderTroca(base, EU, AGORA)).toBe(true);
  });

  it('não sou o alvo', () => {
    expect(podeResponderTroca({ ...base, target: { id: 'outro' } }, EU, AGORA)).toBe(false);
  });

  it('já saiu do meu colo — está com o gestor', () => {
    expect(podeResponderTroca({ ...base, status: 'TARGET_ACCEPTED' }, EU, AGORA)).toBe(false);
  });

  /**
   * O caso que se esquece.
   *
   * O servidor marca EXPIRED por job, então existe uma janela em que a solicitação está
   * vencida e ainda diz PENDING. Mostrar o botão nessa janela produz o pior tipo de erro: a
   * pessoa toca, espera, e recebe uma recusa que não entende.
   */
  it('o prazo venceu, mesmo que o status ainda não tenha sido atualizado', () => {
    expect(podeResponderTroca({ ...base, expires_at: '2026-08-28T11:59:59Z' }, EU, AGORA))
      .toBe(false);
  });

  it('vencer exatamente agora já conta como vencido', () => {
    expect(podeResponderTroca({ ...base, expires_at: AGORA.toISOString() }, EU, AGORA))
      .toBe(false);
  });

  it('sem prazo definido continua respondível', () => {
    expect(podeResponderTroca({ ...base, expires_at: null }, EU, AGORA)).toBe(true);
  });

  it('prazo ilegível não bloqueia — o servidor decide', () => {
    expect(podeResponderTroca({ ...base, expires_at: 'nao-e-data' }, EU, AGORA)).toBe(true);
  });

  it('sessão sem membro não responde nada', () => {
    expect(podeResponderTroca(base, null, AGORA)).toBe(false);
    expect(podeResponderTroca(base, undefined, AGORA)).toBe(false);
  });

  it('aceita o alvo pelo campo plano, quando o objeto não veio', () => {
    expect(podeResponderTroca(
      { status: 'PENDING_TARGET_ACCEPTANCE', target_member_id: EU },
      EU,
      AGORA,
    )).toBe(true);
  });
});

describe('validarPedidoDeAfastamento', () => {
  const valido = { inicio: '2026-09-01', fim: '2026-09-05', motivo: 'Consulta médica' };

  it('pedido completo passa', () => {
    expect(validarPedidoDeAfastamento(valido)).toEqual([]);
  });

  it('data fora do formato é apontada', () => {
    const erros = validarPedidoDeAfastamento({ ...valido, inicio: '01/09/2026' });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain('início');
  });

  it('fim antes do início é apontado — a mesma regra do backend', () => {
    const erros = validarPedidoDeAfastamento({ ...valido, inicio: '2026-09-05', fim: '2026-09-01' });
    expect(erros).toEqual(['A data de fim não pode ser anterior à data de início.']);
  });

  it('um único dia é válido: fim igual ao início', () => {
    expect(validarPedidoDeAfastamento({ ...valido, inicio: '2026-09-01', fim: '2026-09-01' }))
      .toEqual([]);
  });

  /**
   * Comparar como texto só funciona porque as datas são ISO com zeros à esquerda. Este caso
   * é o que provaria o contrário se alguém trocasse por comparação de números ou por `Date`.
   */
  it('a virada de ano é comparada corretamente', () => {
    expect(validarPedidoDeAfastamento({ ...valido, inicio: '2026-12-28', fim: '2027-01-03' }))
      .toEqual([]);
    expect(validarPedidoDeAfastamento({ ...valido, inicio: '2027-01-03', fim: '2026-12-28' }))
      .toHaveLength(1);
  });

  it('motivo curto demais é apontado, e espaço em branco não conta', () => {
    expect(validarPedidoDeAfastamento({ ...valido, motivo: 'x' })).toHaveLength(1);
    expect(validarPedidoDeAfastamento({ ...valido, motivo: '   ' })).toHaveLength(1);
  });

  it('não compara datas que ainda estão mal formatadas', () => {
    // Sem esta guarda, "" < "2026-09-01" seria verdadeiro e o erro de ordem apareceria
    // junto com o de formato, confundindo quem só esqueceu de preencher.
    const erros = validarPedidoDeAfastamento({ inicio: '', fim: '', motivo: 'Viagem' });
    expect(erros).toHaveLength(2);
    expect(erros.join(' ')).not.toContain('anterior');
  });
});

describe('notificações não lidas', () => {
  it('lida é a que tem read_at ou status READ', () => {
    expect(naoFoiLida({ status: 'UNREAD', read_at: null })).toBe(true);
    expect(naoFoiLida({ status: 'SEEN', read_at: null })).toBe(true);
    expect(naoFoiLida({ status: 'READ', read_at: null })).toBe(false);
    expect(naoFoiLida({ status: 'UNREAD', read_at: '2026-08-28T10:00:00Z' })).toBe(false);
  });

  it('conta só as pendentes', () => {
    expect(contarNaoLidas([
      { status: 'UNREAD', read_at: null },
      { status: 'READ', read_at: '2026-08-28T10:00:00Z' },
      { status: 'SEEN', read_at: null },
    ])).toBe(2);
  });

  it('lista vazia conta zero', () => {
    expect(contarNaoLidas([])).toBe(0);
  });
});

describe('agruparTurnosPorDia', () => {
  it('agrupa e ordena por dia', () => {
    const grupos = agruparTurnosPorDia([
      { id: 'b', start_timestamp: '2026-09-02T08:00:00Z' },
      { id: 'a', start_timestamp: '2026-09-01T08:00:00Z' },
      { id: 'c', start_timestamp: '2026-09-01T14:00:00Z' },
    ]);

    expect(grupos.map((g) => g.dia)).toEqual(['2026-09-01', '2026-09-02']);
    expect(grupos[0].turnos.map((t) => t.id)).toEqual(['a', 'c']);
  });

  /**
   * O turno da noite é onde agrupamento por data erra.
   *
   * Se alguém trocar o corte do ISO por `new Date(...).getDate()`, um turno que começa às
   * 23h UTC cai no dia seguinte para quem está em UTC+2 — e a escala mostra o turno no dia
   * errado, sem erro nenhum na tela.
   */
  it('não desloca o turno da noite por fuso do aparelho', () => {
    const grupos = agruparTurnosPorDia([
      { id: 'noite', start_timestamp: '2026-09-01T23:30:00Z' },
    ]);
    expect(grupos[0].dia).toBe('2026-09-01');
  });

  it('lista vazia devolve lista vazia', () => {
    expect(agruparTurnosPorDia([])).toEqual([]);
  });

  it('turno sem data é descartado em vez de virar grupo vazio', () => {
    const grupos = agruparTurnosPorDia([
      { id: 'ok', start_timestamp: '2026-09-01T08:00:00Z' },
      { id: 'sem-data', start_timestamp: '' },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].turnos).toHaveLength(1);
  });
});
