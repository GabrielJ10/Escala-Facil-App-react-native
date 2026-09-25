/**
 * A aritmética da escala.
 *
 * Três coisas quebram aqui, e nenhuma delas grita:
 *
 *   - **dia deslocado por fuso** — o turno aparece na data errada;
 *   - **intervalo grande demais** — o servidor devolve 400 e a tela fica vazia;
 *   - **horário construído no fuso do aparelho** — o gestor cria um turno três horas fora do
 *     que viu, e a diferença só aparece para quem for trabalhar.
 */
import { describe, expect, it } from 'vitest';

import {
  MAXIMO_DE_DIAS,
  corpoDoTurnoAvulso,
  diferencaEmDias,
  ehAvulso,
  ehVagaReservada,
  estaVago,
  rotuloDoCargo,
  hojeNaOrganizacao,
  instanteNaOrganizacao,
  limitarIntervalo,
  resumoDoDia,
  semanaDe,
  somarDias,
  validarTurnoAvulso,
} from '@/nucleo/escala';

const SP = 'America/Sao_Paulo';

describe('somarDias', () => {
  it('soma e subtrai dias', () => {
    expect(somarDias('2026-09-01', 1)).toBe('2026-09-02');
    expect(somarDias('2026-09-01', -1)).toBe('2026-08-31');
    expect(somarDias('2026-09-01', 0)).toBe('2026-09-01');
  });

  it('atravessa a virada do mês e do ano', () => {
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('acerta o ano bissexto', () => {
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2026-02-28', 1)).toBe('2026-03-01');
  });

  /**
   * Se alguém trocar a aritmética UTC por `new Date(dia)` local, este caso quebra a oeste de
   * Greenwich: a meia-noite UTC vira 21h do dia anterior, e somar um dia devolve o mesmo dia.
   */
  it('não depende do fuso de quem roda', () => {
    expect(somarDias('2026-09-01', 7)).toBe('2026-09-08');
  });
});

describe('diferencaEmDias', () => {
  it('conta a distância entre dois dias', () => {
    expect(diferencaEmDias('2026-09-01', '2026-09-08')).toBe(7);
    expect(diferencaEmDias('2026-09-01', '2026-09-01')).toBe(0);
  });

  it('é negativa quando estão invertidos', () => {
    expect(diferencaEmDias('2026-09-08', '2026-09-01')).toBe(-7);
  });
});

describe('semanaDe', () => {
  // 2026-09-02 é uma quarta-feira.
  it('a semana vai de segunda a domingo', () => {
    expect(semanaDe('2026-09-02')).toEqual({ inicio: '2026-08-31', fim: '2026-09-06' });
  });

  it('segunda-feira é o próprio começo', () => {
    expect(semanaDe('2026-08-31')).toEqual({ inicio: '2026-08-31', fim: '2026-09-06' });
  });

  /**
   * Domingo é o caso que o cálculo ingênuo erra.
   *
   * `getUTCDay()` devolve 0 para domingo; sem o tratamento, o recuo daria -1 e a semana
   * começaria na terça seguinte. Domingo pertence à semana que TERMINA nele.
   */
  it('domingo fecha a semana anterior, não abre a seguinte', () => {
    expect(semanaDe('2026-09-06')).toEqual({ inicio: '2026-08-31', fim: '2026-09-06' });
  });

  it('a semana sempre tem sete dias', () => {
    for (const dia of ['2026-09-01', '2026-09-06', '2026-12-31', '2027-01-01']) {
      const { inicio, fim } = semanaDe(dia);
      expect(diferencaEmDias(inicio, fim), `semana de ${dia}`).toBe(6);
    }
  });
});

describe('limitarIntervalo', () => {
  /**
   * `listQuerySchema` recusa acima de 31 dias — pedir 60 devolve 400, não uma lista cortada.
   * Cortar aqui é o que mantém o pedido sempre válido.
   */
  it('corta o que passa do teto do servidor', () => {
    const cortado = limitarIntervalo({ inicio: '2026-09-01', fim: '2026-12-31' });
    expect(diferencaEmDias(cortado.inicio, cortado.fim) + 1).toBe(MAXIMO_DE_DIAS);
  });

  it('exatamente 31 dias passa intacto', () => {
    const trintaEUm = { inicio: '2026-09-01', fim: somarDias('2026-09-01', 30) };
    expect(limitarIntervalo(trintaEUm)).toEqual(trintaEUm);
  });

  it('intervalo pequeno não é alterado', () => {
    const semana = { inicio: '2026-09-01', fim: '2026-09-07' };
    expect(limitarIntervalo(semana)).toEqual(semana);
  });

  it('intervalo invertido vira um dia só, em vez de virar 400', () => {
    expect(limitarIntervalo({ inicio: '2026-09-08', fim: '2026-09-01' }))
      .toEqual({ inicio: '2026-09-08', fim: '2026-09-08' });
  });
});

describe('hojeNaOrganizacao', () => {
  it('usa o fuso da organização, não o do aparelho', () => {
    // 01:00Z do dia 2 ainda é dia 1 em Brasília.
    const instante = new Date('2026-09-02T01:00:00Z');
    expect(hojeNaOrganizacao('America/Sao_Paulo', instante)).toBe('2026-09-01');
    expect(hojeNaOrganizacao('Europe/Lisbon', instante)).toBe('2026-09-02');
  });
});

describe('instanteNaOrganizacao', () => {
  /**
   * O coração da criação de turno.
   *
   * Se isto usar o fuso do aparelho, um gestor viajando cria turnos horas fora do que viu na
   * tela — e a diferença só aparece para quem for trabalhar.
   */
  it('08:00 em Brasília é 11:00Z', () => {
    expect(instanteNaOrganizacao('2026-09-01', '08:00', SP)?.toISOString())
      .toBe('2026-09-01T11:00:00.000Z');
  });

  it('22:00 em Brasília cai no dia seguinte em UTC', () => {
    expect(instanteNaOrganizacao('2026-09-01', '22:00', SP)?.toISOString())
      .toBe('2026-09-02T01:00:00.000Z');
  });

  it('meia-noite não escorrega para o dia errado', () => {
    expect(instanteNaOrganizacao('2026-09-01', '00:00', SP)?.toISOString())
      .toBe('2026-09-01T03:00:00.000Z');
  });

  it('o mesmo relógio dá instantes diferentes em fusos diferentes', () => {
    const emSp = instanteNaOrganizacao('2026-09-01', '08:00', SP)!;
    const emLisboa = instanteNaOrganizacao('2026-09-01', '08:00', 'Europe/Lisbon')!;
    expect(emSp.getTime()).not.toBe(emLisboa.getTime());
  });

  /**
   * O Brasil não usa mais horário de verão, mas o fuso da organização é configurável.
   * Nova York em julho está em UTC-4; em janeiro, UTC-5.
   */
  it('acompanha o horário de verão de fusos que ainda o usam', () => {
    expect(instanteNaOrganizacao('2026-07-01', '08:00', 'America/New_York')?.toISOString())
      .toBe('2026-07-01T12:00:00.000Z');
    expect(instanteNaOrganizacao('2026-01-15', '08:00', 'America/New_York')?.toISOString())
      .toBe('2026-01-15T13:00:00.000Z');
  });

  it('recusa entrada inválida em vez de devolver data errada', () => {
    expect(instanteNaOrganizacao('01/09/2026', '08:00', SP)).toBeNull();
    expect(instanteNaOrganizacao('2026-09-01', '8h', SP)).toBeNull();
    expect(instanteNaOrganizacao('2026-09-01', '25:00', SP)).toBeNull();
    expect(instanteNaOrganizacao('2026-13-01', '08:00', SP)).toBeNull();
    expect(instanteNaOrganizacao('', '', SP)).toBeNull();
  });
});

describe('vaga e resumo do dia', () => {
  const turno = (extra: Record<string, unknown> = {}) => ({
    id: 'x',
    start_timestamp: '2026-09-01T11:00:00Z',
    end_timestamp: '2026-09-01T19:00:00Z',
    ...extra,
  });

  it('turno sem ninguém é vaga', () => {
    expect(estaVago(turno())).toBe(true);
    expect(estaVago(turno({ member: { id: 'm1', name: 'Ana' } }))).toBe(false);
    // O transformer devolve `member_id` solto quando não há nome do membro.
    expect(estaVago(turno({ member_id: 'm1' }))).toBe(false);
  });

  it('resume o que o gestor procura', () => {
    expect(resumoDoDia([
      turno({ member: { id: 'm1' } }),
      turno(),
      turno({ member: { id: 'm2' }, warnings: [{ code: 'ROLE_MISMATCH' }] }),
    ])).toEqual({ total: 3, preenchidos: 2, vagas: 1, comAviso: 1 });
  });

  it('dia sem turno resume em zeros', () => {
    expect(resumoDoDia([])).toEqual({ total: 0, preenchidos: 0, vagas: 0, comAviso: 0 });
  });
});

describe('vaga reservada e cargo', () => {
  const base = { id: 't', start_timestamp: '2026-09-01T11:00:00.000Z', end_timestamp: '2026-09-01T19:00:00.000Z' };

  it('reservada = avulso (manual ou IA) sem cargo e sem ninguém; qualquer outra coisa não é', () => {
    expect(ehVagaReservada({ ...base, origin: 'ADHOC_MANUAL', required_role: null })).toBe(true);
    expect(ehVagaReservada({ ...base, origin: 'ADHOC_AI', required_role: '' })).toBe(true);
    expect(ehVagaReservada({ ...base, origin: 'ADHOC_MANUAL', required_role: 'ANY' })).toBe(false);
    expect(ehVagaReservada({ ...base, origin: 'ADHOC_MANUAL', required_role: null, member: { id: 'm' } })).toBe(false);
    expect(ehVagaReservada({ ...base, origin: 'AUTOFILL', required_role: null })).toBe(false);
    expect(ehVagaReservada({ ...base, required_role: null })).toBe(false);
    expect(ehAvulso({ ...base, origin: 'ADHOC_AI' })).toBe(true);
    expect(ehAvulso({ ...base })).toBe(false);
  });

  it('ANY vira "Qualquer cargo"; vazio não tem rótulo; cargo real vai como veio', () => {
    expect(rotuloDoCargo('ANY')).toBe('Qualquer cargo');
    expect(rotuloDoCargo('any')).toBe('Qualquer cargo');
    expect(rotuloDoCargo('')).toBeNull();
    expect(rotuloDoCargo(null)).toBeNull();
    expect(rotuloDoCargo('Enfermeiro')).toBe('Enfermeiro');
  });
});

describe('turno avulso', () => {
  const valido = {
    dia: '2026-09-01',
    hora: '08:00',
    duracaoMinutos: 480,
    localId: '11111111-1111-4111-8111-111111111111',
    modeloId: '22222222-2222-4222-8222-222222222222',
  };

  it('rascunho completo passa', () => {
    expect(validarTurnoAvulso(valido)).toEqual([]);
  });

  it('aponta o que falta', () => {
    expect(validarTurnoAvulso({ ...valido, localId: null })).toContain('Escolha o local.');
    expect(validarTurnoAvulso({ ...valido, modeloId: null }))
      .toContain('Escolha o modelo de turno.');
    expect(validarTurnoAvulso({ ...valido, duracaoMinutos: 0 })).toHaveLength(1);
  });

  it('monta o corpo com os instantes no fuso da organização', () => {
    expect(corpoDoTurnoAvulso(valido, SP)).toEqual({
      location_id: valido.localId,
      shift_model_id: valido.modeloId,
      start_timestamp: '2026-09-01T11:00:00.000Z',
      end_timestamp: '2026-09-01T19:00:00.000Z',
      required_role: 'ANY',
    });
  });

  /**
   * Com o turno avulso da grade ligado no servidor, avulso SEM cargo e sem pessoa é "vaga
   * reservada" e o preenchimento automático o ignora. A vaga do app sempre foi "qualquer
   * pessoa" — por isso o `ANY` vai explícito, com ou sem a flag no servidor.
   */
  it('a vaga do app é "qualquer pessoa": required_role ANY vai sempre, nunca vazio', () => {
    expect(corpoDoTurnoAvulso(valido, SP)!.required_role).toBe('ANY');
    expect(corpoDoTurnoAvulso(valido, SP, '33333333-3333-4333-8333-333333333333')!.required_role).toBe('ANY');
  });

  /**
   * `createAdhocSchema` é `.strict()`: um campo a mais e a requisição inteira é recusada.
   * Mandar `member_id: null` para um turno sem ninguém derrubaria a criação.
   */
  it('member_id só existe quando há alguém — nunca vai como null', () => {
    const semMembro = corpoDoTurnoAvulso(valido, SP)!;
    expect('member_id' in semMembro).toBe(false);

    const comMembro = corpoDoTurnoAvulso(valido, SP, '33333333-3333-4333-8333-333333333333')!;
    expect(comMembro.member_id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('o término é sempre depois do início, como o backend exige', () => {
    const corpo = corpoDoTurnoAvulso(valido, SP)!;
    expect(new Date(corpo.end_timestamp).getTime())
      .toBeGreaterThan(new Date(corpo.start_timestamp).getTime());
  });

  it('turno que vira o dia continua coerente', () => {
    const noturno = corpoDoTurnoAvulso({ ...valido, hora: '22:00', duracaoMinutos: 480 }, SP)!;
    expect(noturno.start_timestamp).toBe('2026-09-02T01:00:00.000Z');
    expect(noturno.end_timestamp).toBe('2026-09-02T09:00:00.000Z');
  });

  it('rascunho inválido não monta corpo nenhum', () => {
    expect(corpoDoTurnoAvulso({ ...valido, localId: null }, SP)).toBeNull();
    expect(corpoDoTurnoAvulso({ ...valido, dia: 'ontem' }, SP)).toBeNull();
  });
});
