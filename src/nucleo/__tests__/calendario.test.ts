/**
 * A reconciliação do calendário.
 *
 * O risco aqui não é falhar — é acertar quase sempre. Um evento que fica para trás, ou um
 * que some, acontece no calendário DE OUTRO APLICATIVO, onde nada avisa. A pessoa confia no
 * que vê lá e aparece na hora errada.
 */
import { describe, expect, it } from 'vitest';

import {
  aplicarAoMapeamento,
  assinaturaDoTurno,
  detalhesDoEvento,
  lerMapeamento,
  planejarSincronizacao,
  tituloDoEvento,
  type Mapeamento,
  type TurnoParaCalendario,
} from '@/nucleo/calendario';

const SP = 'America/Sao_Paulo';
const JANELA = { inicio: '2026-09-01', fim: '2026-09-30' };

function turno(extra: Partial<TurnoParaCalendario> = {}): TurnoParaCalendario {
  return {
    id: 't1',
    start_timestamp: '2026-09-10T11:00:00Z',
    end_timestamp: '2026-09-10T19:00:00Z',
    location: { name: 'Loja Centro' },
    ...extra,
  };
}

describe('assinaturaDoTurno', () => {
  it('muda quando o horário muda', () => {
    expect(assinaturaDoTurno(turno()))
      .not.toBe(assinaturaDoTurno(turno({ start_timestamp: '2026-09-10T12:00:00Z' })));
  });

  it('muda quando o local muda', () => {
    expect(assinaturaDoTurno(turno()))
      .not.toBe(assinaturaDoTurno(turno({ location: { name: 'Loja Sul' } })));
  });

  /**
   * O `status` do turno de propósito não entra.
   *
   * Publicar uma escala que já estava correta reescreveria todos os eventos do mês por nada,
   * e cada reescrita é uma notificação do calendário no celular da pessoa.
   */
  it('não muda com campos que o calendário não mostra', () => {
    const a = { ...turno(), status: 'DRAFT' } as TurnoParaCalendario;
    const b = { ...turno(), status: 'PUBLISHED' } as TurnoParaCalendario;
    expect(assinaturaDoTurno(a)).toBe(assinaturaDoTurno(b));
  });

  it('turno sem local tem assinatura estável', () => {
    expect(assinaturaDoTurno(turno({ location: null })))
      .toBe(assinaturaDoTurno(turno({ location: null })));
  });
});

describe('texto do evento', () => {
  it('o título traz o local, que é o que a pessoa precisa ver na agenda', () => {
    expect(tituloDoEvento(turno())).toBe('Turno · Loja Centro');
  });

  it('sem local, o título ainda diz o que é', () => {
    expect(tituloDoEvento(turno({ location: null }))).toBe('Turno');
  });

  it('os detalhes dizem de onde o evento veio', () => {
    // Quem encontra um evento estranho na agenda precisa saber quem o criou.
    expect(detalhesDoEvento(turno())).toContain('Escala Fácil');
  });

  it('o modelo do turno entra nos detalhes quando existe', () => {
    expect(detalhesDoEvento(turno({ shift_model: { name: 'Manhã' } }))).toContain('Manhã');
  });
});

describe('planejarSincronizacao', () => {
  it('turno novo é criado', () => {
    const plano = planejarSincronizacao([turno()], {}, JANELA);
    expect(plano.criar.map((t) => t.id)).toEqual(['t1']);
    expect(plano.atualizar).toEqual([]);
    expect(plano.remover).toEqual([]);
  });

  it('turno inalterado não é tocado', () => {
    const mapeamento: Mapeamento = {
      t1: { eventoId: 'e1', assinatura: assinaturaDoTurno(turno()), dia: '2026-09-10' },
    };
    const plano = planejarSincronizacao([turno()], mapeamento, JANELA);

    expect(plano).toEqual({ criar: [], atualizar: [], remover: [] });
  });

  it('turno que mudou de horário é atualizado, não recriado', () => {
    const mapeamento: Mapeamento = {
      t1: { eventoId: 'e1', assinatura: assinaturaDoTurno(turno()), dia: '2026-09-10' },
    };
    const mudado = turno({ start_timestamp: '2026-09-10T13:00:00Z' });
    const plano = planejarSincronizacao([mudado], mapeamento, JANELA);

    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([{ turno: mudado, eventoId: 'e1' }]);
    // Recriar deixaria o evento antigo órfão na agenda — dois turnos onde há um.
    expect(plano.remover).toEqual([]);
  });

  it('turno que saiu da escala tem o evento removido', () => {
    const mapeamento: Mapeamento = {
      t1: { eventoId: 'e1', assinatura: 'qualquer', dia: '2026-09-10' },
    };
    const plano = planejarSincronizacao([], mapeamento, JANELA);

    expect(plano.remover).toEqual([{ turnoId: 't1', eventoId: 'e1' }]);
  });

  /**
   * O defeito que este módulo existe para não ter.
   *
   * O app sincroniza uma janela — as próximas semanas, não a vida inteira. Reconciliar
   * contra o mapeamento inteiro faria o primeiro sync apagar tudo que está fora dela: o mês
   * passado, o mês que vem, tudo que simplesmente não foi consultado desta vez.
   *
   * Some sem erro nenhum, e a pessoa só descobre quando procura o turno e ele não está lá.
   */
  it('evento FORA da janela nunca é removido por ausência', () => {
    const mapeamento: Mapeamento = {
      passado: { eventoId: 'e0', assinatura: 'x', dia: '2026-08-15' },
      futuro: { eventoId: 'e2', assinatura: 'x', dia: '2026-11-20' },
      dentro: { eventoId: 'e1', assinatura: 'x', dia: '2026-09-10' },
    };

    const plano = planejarSincronizacao([], mapeamento, JANELA);

    expect(plano.remover).toEqual([{ turnoId: 'dentro', eventoId: 'e1' }]);
  });

  it('a borda da janela conta como dentro', () => {
    const mapeamento: Mapeamento = {
      primeiro: { eventoId: 'a', assinatura: 'x', dia: '2026-09-01' },
      ultimo: { eventoId: 'b', assinatura: 'x', dia: '2026-09-30' },
    };
    const plano = planejarSincronizacao([], mapeamento, JANELA);

    expect(plano.remover.map((r) => r.turnoId).sort()).toEqual(['primeiro', 'ultimo']);
  });

  it('sem dia gravado, o evento não é removido — na dúvida, preserva', () => {
    // Mapeamento de uma versão antiga do app pode não ter o dia. Apagar por não saber
    // seria destruir dado por falta de informação nossa.
    const plano = planejarSincronizacao(
      [],
      { antigo: { eventoId: 'e', assinatura: 'x', dia: '' } },
      JANELA,
    );
    expect(plano.remover).toEqual([]);
  });

  it('turno sem id é ignorado em vez de criar evento sem dono', () => {
    const plano = planejarSincronizacao([turno({ id: '' })], {}, JANELA);
    expect(plano.criar).toEqual([]);
  });

  it('as três operações convivem no mesmo plano', () => {
    const antigo = turno({ id: 'antigo' });
    const mapeamento: Mapeamento = {
      antigo: { eventoId: 'e-antigo', assinatura: assinaturaDoTurno(antigo), dia: '2026-09-10' },
      mudou: { eventoId: 'e-mudou', assinatura: 'assinatura-velha', dia: '2026-09-11' },
      sumiu: { eventoId: 'e-sumiu', assinatura: 'x', dia: '2026-09-12' },
    };

    const plano = planejarSincronizacao(
      [antigo, turno({ id: 'mudou' }), turno({ id: 'novo' })],
      mapeamento,
      JANELA,
    );

    expect(plano.criar.map((t) => t.id)).toEqual(['novo']);
    expect(plano.atualizar.map((a) => a.eventoId)).toEqual(['e-mudou']);
    expect(plano.remover).toEqual([{ turnoId: 'sumiu', eventoId: 'e-sumiu' }]);
  });
});

describe('aplicarAoMapeamento', () => {
  it('grava o evento criado com a assinatura e o dia', () => {
    const t = turno();
    const novo = aplicarAoMapeamento({}, {
      criados: [{ turno: t, eventoId: 'e1' }],
      atualizados: [],
      removidos: [],
    }, SP);

    expect(novo.t1).toEqual({
      eventoId: 'e1',
      assinatura: assinaturaDoTurno(t),
      dia: '2026-09-10',
    });
  });

  /**
   * O dia é gravado no fuso da ORGANIZAÇÃO, como todo o resto do produto. Um turno de 22h em
   * Brasília chega como 01:00Z do dia seguinte; gravar o dia UTC o colocaria fora da janela
   * na próxima reconciliação, e ele nunca mais seria atualizado.
   */
  it('o dia gravado é o do fuso da organização', () => {
    const noturno = turno({ start_timestamp: '2026-09-11T01:00:00Z' });
    const novo = aplicarAoMapeamento({}, {
      criados: [{ turno: noturno, eventoId: 'e1' }],
      atualizados: [],
      removidos: [],
    }, SP);

    expect(novo.t1.dia).toBe('2026-09-10');
  });

  it('a atualização substitui a assinatura antiga', () => {
    const anterior: Mapeamento = { t1: { eventoId: 'e1', assinatura: 'velha', dia: '2026-09-10' } };
    const t = turno();
    const novo = aplicarAoMapeamento(anterior, {
      criados: [],
      atualizados: [{ turno: t, eventoId: 'e1' }],
      removidos: [],
    }, SP);

    expect(novo.t1.assinatura).toBe(assinaturaDoTurno(t));
  });

  it('a remoção tira do mapeamento', () => {
    const anterior: Mapeamento = { t1: { eventoId: 'e1', assinatura: 'x', dia: '2026-09-10' } };
    const novo = aplicarAoMapeamento(anterior, {
      criados: [], atualizados: [], removidos: ['t1'],
    }, SP);

    expect(novo).toEqual({});
  });

  it('não altera o mapeamento recebido', () => {
    const anterior: Mapeamento = { t1: { eventoId: 'e1', assinatura: 'x', dia: '2026-09-10' } };
    aplicarAoMapeamento(anterior, { criados: [], atualizados: [], removidos: ['t1'] }, SP);
    expect(anterior.t1).toBeDefined();
  });
});

describe('lerMapeamento', () => {
  /**
   * O que está gravado no aparelho sobreviveu a versões anteriores do app. Confiar no
   * formato é como o sync passa a quebrar depois de uma atualização, para uma pessoa só, de
   * um jeito impossível de reproduzir.
   */
  it('aceita o formato correto', () => {
    const bom = { t1: { eventoId: 'e1', assinatura: 'a', dia: '2026-09-10' } };
    expect(lerMapeamento(bom)).toEqual(bom);
  });

  it('descarta entrada sem id de evento', () => {
    expect(lerMapeamento({ t1: { assinatura: 'a', dia: 'x' } })).toEqual({});
    expect(lerMapeamento({ t1: { eventoId: '', assinatura: 'a' } })).toEqual({});
  });

  it('completa campos faltando em vez de quebrar', () => {
    expect(lerMapeamento({ t1: { eventoId: 'e1' } }))
      .toEqual({ t1: { eventoId: 'e1', assinatura: '', dia: '' } });
  });

  it('lixo vira mapeamento vazio', () => {
    expect(lerMapeamento(null)).toEqual({});
    expect(lerMapeamento(undefined)).toEqual({});
    expect(lerMapeamento('texto')).toEqual({});
    expect(lerMapeamento([1, 2, 3])).toEqual({});
    expect(lerMapeamento({ t1: null })).toEqual({});
  });
});
