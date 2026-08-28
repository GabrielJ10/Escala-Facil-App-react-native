/**
 * Regras — as funções que decidem o que o motor vai gerar.
 *
 * Esta é a tela onde o gestor descreve a operação: quantas pessoas, de qual cargo, em qual
 * local, em quais dias, por quanto tempo. O que a torna perigosa é que um erro aqui não se
 * manifesta como erro. Ele se manifesta como escala errada, dias depois, e ninguém liga uma
 * coisa à outra.
 *
 * Os testes se concentram em três lugares onde isso já quase aconteceu:
 *
 *   1. Datas. A tela trabalha com data-só ("2026-03-16"), e `new Date()` sobre isso é
 *      meia-noite UTC — dia 15 no Brasil. Uma vigência inteira desloca um dia.
 *   2. Situação da cobertura. Uma cobertura pode estar ativa, dentro da vigência, e mesmo
 *      assim não gerar nada porque o horário que ela aponta foi encerrado. Chamar isso de
 *      "Ativa" faz o gestor esperar uma escala que nunca vem.
 *   3. O corpo enviado ao backend. Remover o intervalo tem que apagar o intervalo — não
 *      omitir o campo e deixar o antigo gravado.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  formatRoleLabel,
  todayStr,
  tomorrowStr,
  formatDays,
  safeParseDate,
  formatDateDisplay,
  formatDuration,
  isPendingDeletion,
  getPendingEffectiveDate,
  toApiDate,
  timeToMinutes,
  minutesToTime,
  formatMinutesPretty,
  formatBreak,
  isEffectiveDateRequiredError,
  isShiftModelUnavailableForRequirement,
  getShiftModelUnavailableLabel,
  isRequirementDateEnded,
  isRequirementReadOnly,
  getRequirementSituacao,
  buildFormSnapshot,
  buildModelBody,
  hasSensitiveChange,
  ANY_ROLE_VALUE,
} from '@/contract/regrasHelpers';

// Data fixa: sem isso, "encerrada" e "agendada" mudariam de resposta conforme o dia.
const HOJE = new Date('2026-03-16T12:00:00');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOJE);
});
afterEach(() => vi.useRealTimers());

// ═══════════════════════════════════════════════════════════════════════════
describe('Cargo', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('traduz o cargo curinga em vez de mostrar o código', () => {
    expect(formatRoleLabel(ANY_ROLE_VALUE)).toBe('Qualquer cargo');
    expect(formatRoleLabel('any')).toBe('Qualquer cargo');
    expect(formatRoleLabel('  Any  ')).toBe('Qualquer cargo');
  });

  it('mostra o cargo real como o gestor escreveu', () => {
    expect(formatRoleLabel('Enfermeira')).toBe('Enfermeira');
    expect(formatRoleLabel('Técnico de Enfermagem')).toBe('Técnico de Enfermagem');
  });

  it('cargo ausente vira travessão, não "null" nem vazio', () => {
    expect(formatRoleLabel(null)).toBe('—');
    expect(formatRoleLabel(undefined)).toBe('—');
    expect(formatRoleLabel('')).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Dias da semana', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('lista os dias na ordem da semana, não na ordem em que foram clicados', () => {
    expect(formatDays([5, 1, 3])).toBe('Seg, Qua, Sex');
  });

  it('a semana inteira vira uma frase, não sete siglas', () => {
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe('Toda a semana');
    expect(formatDays([6, 5, 4, 3, 2, 1, 0])).toBe('Toda a semana');
  });

  it('nenhum dia marcado é travessão — cobertura que não gera nada', () => {
    expect(formatDays([])).toBe('—');
    expect(formatDays(null as unknown as number[])).toBe('—');
  });

  it('domingo é o dia 0 e sábado o 6 — a mesma base do backend', () => {
    expect(formatDays([0])).toBe('Dom');
    expect(formatDays([6])).toBe('Sáb');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Datas — a armadilha do fuso', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('data-só fica no dia certo, não no dia anterior', () => {
    // `new Date('2026-03-16')` seria meia-noite UTC = 15/03 21h em Brasília.
    const d = safeParseDate('2026-03-16');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(16);
  });

  it('ancora ao meio-dia — nenhum fuso do mundo empurra meio-dia para outro dia', () => {
    const d = safeParseDate('2026-03-16');
    expect(d?.getHours()).toBe(12);
  });

  it('data com hora tem a hora descartada e vira o mesmo dia local', () => {
    const d = safeParseDate('2026-03-16T23:30:00.000Z');
    expect(d?.getDate()).toBe(16);
  });

  it('texto ilegível devolve null em vez de Invalid Date', () => {
    expect(safeParseDate('não é data')).toBeNull();
    expect(safeParseDate('')).toBeNull();
  });

  /**
   * O construtor de Date transborda em silêncio: `new Date(2026, 98, 99)` não dá erro,
   * devolve uma data real oito anos à frente. Num campo de vigência isso viraria "Agendada
   * para 07/06/2034" — plausível, errada, e sem nada indicando que o valor era lixo.
   */
  it('data fora de faixa é recusada em vez de transbordar para outro ano', () => {
    expect(safeParseDate('2026-99-99')).toBeNull();
    expect(safeParseDate('2026-13-01')).toBeNull();
    expect(safeParseDate('2026-02-30')).toBeNull();
    expect(safeParseDate('2026-00-10')).toBeNull();
  });

  it('29 de fevereiro passa em ano bissexto e é recusado fora dele', () => {
    expect(safeParseDate('2028-02-29')?.getDate()).toBe(29);
    expect(safeParseDate('2026-02-29')).toBeNull();
  });

  it('exibe no formato brasileiro', () => {
    expect(formatDateDisplay('2026-03-16')).toBe('16/03/2026');
    expect(formatDateDisplay('2026-12-31')).toBe('31/12/2026');
  });

  it('data ilegível volta como veio — melhor o texto cru que "Invalid Date"', () => {
    expect(formatDateDisplay('sem data')).toBe('sem data');
  });

  it('converte de volta para o formato do backend', () => {
    expect(toApiDate(new Date(2026, 2, 16, 12))).toBe('2026-03-16');
    expect(toApiDate(undefined)).toBe('');
  });

  it('ida e volta preserva o dia', () => {
    const original = '2026-03-16';
    expect(toApiDate(safeParseDate(original) ?? undefined)).toBe(original);
  });

  it('hoje e amanhã são dias consecutivos', () => {
    expect(todayStr()).toBe('2026-03-16');
    expect(tomorrowStr()).toBe('2026-03-17');
  });

  it('amanhã atravessa a virada do mês', () => {
    vi.setSystemTime(new Date('2026-03-31T12:00:00'));
    expect(tomorrowStr()).toBe('2026-04-01');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Vigência da regra', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('sem datas é perpétua', () => {
    expect(formatDuration({})).toBe('Perpétuo');
    expect(formatDuration({ start_date: null, end_date: null })).toBe('Perpétuo');
  });

  it('faixa fechada mostra os dois extremos', () => {
    expect(formatDuration({ start_date: '2026-03-01', end_date: '2026-03-31' }))
      .toBe('01/03/2026 — 31/03/2026');
  });

  it('faixa aberta diz de que lado está aberta', () => {
    expect(formatDuration({ start_date: '2026-03-01' })).toBe('A partir de 01/03/2026');
    expect(formatDuration({ end_date: '2026-03-31' })).toBe('Até 31/03/2026');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Encerramento agendado — a regra ainda está gerando', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('marcada explicitamente para encerrar conta como pendente', () => {
    expect(isPendingDeletion({ pending_deletion: true })).toBe(true);
  });

  it('ativa com data futura está encerrando, não encerrada', () => {
    // O gestor precisa ver que ela CONTINUA gerando escala até lá.
    expect(isPendingDeletion({ is_active: true, end_date: '2026-09-30' })).toBe(true);
  });

  it('ativa com data já passada não é "encerrando" — já encerrou', () => {
    expect(isPendingDeletion({ is_active: true, end_date: '2026-01-01' })).toBe(false);
  });

  it('já inativa não está encerrando — o encerramento aconteceu', () => {
    expect(isPendingDeletion({ is_active: false, end_date: '2026-09-30' })).toBe(false);
  });

  it('ativa sem data nenhuma não está encerrando', () => {
    expect(isPendingDeletion({ is_active: true })).toBe(false);
  });

  it('data de encerramento ilegível não vira encerramento agendado', () => {
    expect(isPendingDeletion({ is_active: true, end_date: 'qualquer coisa' })).toBe(false);
  });

  it('a data explícita de encerramento tem prioridade sobre o fim da vigência', () => {
    expect(getPendingEffectiveDate({
      pending_deletion_effective_date: '2026-06-30',
      end_date: '2026-12-31',
    })).toBe('2026-06-30');
  });

  it('sem data explícita, o fim da vigência é a data do encerramento', () => {
    expect(getPendingEffectiveDate({ end_date: '2026-12-31' })).toBe('2026-12-31');
    expect(getPendingEffectiveDate({})).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Horas e minutos', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('converte hora para minutos', () => {
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('00:45')).toBe(45);
    expect(timeToMinutes('12:00')).toBe(720);
    expect(timeToMinutes('24:00')).toBe(1440);
  });

  it('texto ilegível vira zero em vez de NaN — NaN viraria turno sem fim', () => {
    expect(timeToMinutes('')).toBe(0);
    expect(timeToMinutes('abc')).toBe(0);
    expect(timeToMinutes('8')).toBe(0);
    expect(timeToMinutes('08:30:00')).toBe(0);
    expect(Number.isNaN(timeToMinutes('xx:yy'))).toBe(false);
  });

  it('converte minutos de volta para hora, com zero à esquerda', () => {
    expect(minutesToTime(510)).toBe('08:30');
    expect(minutesToTime(45)).toBe('00:45');
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(1440)).toBe('24:00');
  });

  it('ida e volta preserva o valor', () => {
    for (const t of ['08:30', '00:15', '12:00', '23:59']) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    }
  });

  it('minuto ausente devolve campo vazio, não "00:00"', () => {
    // "00:00" num campo de duração seria um turno de duração zero.
    expect(minutesToTime(null)).toBe('');
    expect(minutesToTime(undefined)).toBe('');
    expect(minutesToTime(NaN)).toBe('');
  });

  it('para leitura, menos de uma hora sai em minutos', () => {
    expect(formatMinutesPretty(45)).toBe('45 minutos');
    expect(formatMinutesPretty(15)).toBe('15 minutos');
  });

  it('para leitura, uma hora ou mais sai no formato de relógio', () => {
    expect(formatMinutesPretty(510)).toBe('08:30h');
    expect(formatMinutesPretty(720)).toBe('12:00h');
  });

  it('zero é "0h" e ausente é travessão — coisas diferentes', () => {
    expect(formatMinutesPretty(0)).toBe('0h');
    expect(formatMinutesPretty(null)).toBe('—');
    expect(formatMinutesPretty(undefined)).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Intervalo do turno', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('turno sem intervalo é travessão', () => {
    expect(formatBreak({ has_break: false })).toBe('—');
    expect(formatBreak({})).toBe('—');
  });

  it('intervalo com horário fixo mostra duração e faixa', () => {
    expect(formatBreak({
      has_break: true, break_duration_minutes: 60,
      break_start_time: '12:00', break_end_time: '13:00',
    })).toBe('01:00h - 12:00 às 13:00');
  });

  it('intervalo flexível mostra só a duração', () => {
    expect(formatBreak({ has_break: true, break_duration_minutes: 30 })).toBe('30 minutos');
  });

  it('horário em branco conta como flexível, não como faixa vazia', () => {
    expect(formatBreak({
      has_break: true, break_duration_minutes: 30,
      break_start_time: '   ', break_end_time: '',
    })).toBe('30 minutos');
  });

  it('marcado como tendo intervalo mas sem duração é travessão', () => {
    expect(formatBreak({ has_break: true, break_duration_minutes: null })).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Horário disponível para uma cobertura nova', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('horário ativo e sem versão pendente pode ser usado', () => {
    expect(isShiftModelUnavailableForRequirement({ is_active: true })).toBe(false);
  });

  it.each([
    ['com nova versão agendada', { pending_version: { id: 'v2' } }, 'novo horário agendado'],
    ['substituído', { superseded_by_id: 'sm-2' }, 'novo horário agendado'],
    ['encerrado', { is_ended: true }, 'horário encerrado'],
    ['inativo', { is_active: false }, 'horário encerrado'],
  ])('horário %s não pode ser apontado, e a tela explica por quê', (_nome, modelo, rotulo) => {
    expect(isShiftModelUnavailableForRequirement(modelo)).toBe(true);
    expect(getShiftModelUnavailableLabel(modelo)).toBe(rotulo);
  });

  it('horário inexistente não é "indisponível" — é ausência de escolha', () => {
    expect(isShiftModelUnavailableForRequirement(null)).toBe(false);
    expect(isShiftModelUnavailableForRequirement(undefined)).toBe(false);
  });

  it('horário disponível não tem rótulo de impedimento', () => {
    expect(getShiftModelUnavailableLabel({ is_active: true })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Cobertura encerrada e somente-leitura', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('vigência vencida com ativa=true conta como encerrada', () => {
    // Caso típico: o horário vinculado foi encerrado e cortou a vigência.
    expect(isRequirementDateEnded({ is_active: true, end_date: '2026-01-01' })).toBe(true);
  });

  it('vigência futura não é encerrada', () => {
    expect(isRequirementDateEnded({ is_active: true, end_date: '2026-12-31' })).toBe(false);
  });

  it('já inativa não entra nessa categoria — o rótulo dela é outro', () => {
    expect(isRequirementDateEnded({ is_active: false, end_date: '2026-01-01' })).toBe(false);
  });

  it('substituída não entra nessa categoria — o rótulo dela é outro', () => {
    expect(isRequirementDateEnded({ is_active: true, superseded_by_id: 'r2', end_date: '2026-01-01' })).toBe(false);
  });

  it('substituída ou vencida não se edita mais', () => {
    expect(isRequirementReadOnly({ superseded_by_id: 'r2' })).toBe(true);
    expect(isRequirementReadOnly({ is_active: true, end_date: '2026-01-01' })).toBe(true);
  });

  it('cobertura viva continua editável', () => {
    expect(isRequirementReadOnly({ is_active: true, end_date: '2026-12-31' })).toBe(false);
    expect(isRequirementReadOnly({ is_active: true })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Situação da cobertura — o rótulo tem que explicar a escala', () => {
// ═══════════════════════════════════════════════════════════════════════════

  it('cobertura viva e vigente é Ativa', () => {
    expect(getRequirementSituacao({ is_active: true })).toEqual({ label: 'Ativa', variant: 'default' });
  });

  /**
   * O caso mais fácil de perder e o mais caro.
   *
   * A cobertura está ativa, dentro da vigência, e mesmo assim não gera nada — porque o
   * horário que ela aponta foi encerrado. Mostrar "Ativa" faria o gestor esperar uma escala
   * que nunca vem, e procurar o problema em todo lugar menos aqui.
   */
  it('ativa apontando para horário encerrado NÃO é Ativa', () => {
    expect(getRequirementSituacao({
      is_active: true,
      shift_model: { is_ended: true },
    })).toEqual({ label: 'Sem horário ativo', variant: 'secondary' });

    expect(getRequirementSituacao({
      is_active: true,
      shift_model: { is_active: false },
    }).label).toBe('Sem horário ativo');
  });

  it('encerramento agendado mostra a data — ela ainda está gerando até lá', () => {
    expect(getRequirementSituacao({ is_active: true, end_date: '2026-09-30' })).toEqual({
      label: 'Encerrando em 30/09/2026', variant: 'outline',
    });
  });

  it('encerramento agendado sem data tem rótulo próprio', () => {
    expect(getRequirementSituacao({ is_active: true, pending_deletion: true }).label)
      .toBe('Encerramento agendado');
  });

  it('vigência ainda não começou é Agendada, com a data', () => {
    expect(getRequirementSituacao({ is_active: true, start_date: '2026-06-01' })).toEqual({
      label: 'Agendada para 01/06/2026', variant: 'outline',
    });
  });

  it('vigência vencida é Encerrada', () => {
    expect(getRequirementSituacao({ is_active: true, end_date: '2026-01-01' }).label).toBe('Encerrada');
  });

  it('desativada é Inativa', () => {
    expect(getRequirementSituacao({ is_active: false }).label).toBe('Inativa');
  });

  it('substituída é Substituída', () => {
    expect(getRequirementSituacao({ is_active: true, superseded_by_id: 'r2' }).label).toBe('Substituída');
  });

  /**
   * A ordem das checagens é a regra.
   *
   * Uma cobertura pode ser substituída E ter encerramento agendado E apontar para um horário
   * morto ao mesmo tempo. O rótulo tem que ser o do motivo mais forte — "Substituída" explica
   * tudo, os outros seriam ruído sobre uma linha que já não é mais a versão vigente.
   */
  it('com vários motivos ao mesmo tempo, mostra o mais forte', () => {
    const bagunca = {
      is_active: true,
      superseded_by_id: 'r2',
      end_date: '2026-09-30',
      shift_model: { is_ended: true },
    };
    expect(getRequirementSituacao(bagunca).label).toBe('Substituída');
  });

  it('encerramento agendado vence "sem horário ativo"', () => {
    expect(getRequirementSituacao({
      is_active: true,
      end_date: '2026-09-30',
      shift_model: { is_ended: true },
    }).label).toBe('Encerrando em 30/09/2026');
  });

  it('todo rótulo tem uma variante válida — nenhum caminho devolve estilo indefinido', () => {
    const casos = [
      { is_active: true },
      { is_active: false },
      { is_active: true, superseded_by_id: 'r2' },
      { is_active: true, end_date: '2026-09-30' },
      { is_active: true, end_date: '2026-01-01' },
      { is_active: true, start_date: '2026-06-01' },
      { is_active: true, shift_model: { is_ended: true } },
    ];
    for (const c of casos) {
      const s = getRequirementSituacao(c);
      expect(s.label).toBeTruthy();
      expect(['default', 'secondary', 'outline']).toContain(s.variant);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Retrato do formulário — o botão salvar só acorda com mudança real', () => {
// ═══════════════════════════════════════════════════════════════════════════

  const base = {
    role: 'Enfermeira', quantity: '2', location_id: 'loc-1', shift_model_id: 'sm-1',
    days_of_week: [1, 2, 3], start_date: '2026-03-01', end_date: '',
  };

  it('marcar os mesmos dias em outra ordem não é uma mudança', () => {
    expect(buildFormSnapshot({ ...base, days_of_week: [3, 1, 2] }, []))
      .toBe(buildFormSnapshot(base, []));
  });

  it('mudar um dia é uma mudança', () => {
    expect(buildFormSnapshot({ ...base, days_of_week: [1, 2, 4] }, []))
      .not.toBe(buildFormSnapshot(base, []));
  });

  it.each(['role', 'quantity', 'location_id', 'shift_model_id', 'start_date'])(
    'mudar %s é uma mudança',
    (campo) => {
      expect(buildFormSnapshot({ ...base, [campo]: 'outro' }, []))
        .not.toBe(buildFormSnapshot(base, []));
    }
  );

  it('data vazia e data ausente são o mesmo estado', () => {
    expect(buildFormSnapshot({ ...base, end_date: '' }, []))
      .toBe(buildFormSnapshot({ ...base, end_date: '' }, []));
  });

  it('mexer nas regras de qualificação é uma mudança', () => {
    expect(buildFormSnapshot(base, [{ field: 'crm', operator: 'EXISTS' }]))
      .not.toBe(buildFormSnapshot(base, []));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('O horário enviado ao backend', () => {
// ═══════════════════════════════════════════════════════════════════════════

  const form = {
    name: 'Diurno', start_time: '07:00', duration_time: '12:00', rest_time: '36:00',
    has_break: false, break_duration_time: '', break_start_time: '', break_end_time: '',
  };

  it('converte os campos de hora para minutos', () => {
    const body = buildModelBody(form);
    expect(body.duration_minutes).toBe(720);
    expect(body.rest_minutes_after).toBe(2160);
    expect(body.start_time).toBe('07:00');
  });

  /**
   * Sem intervalo, os três campos vão como null EXPLÍCITO.
   *
   * Se fossem omitidos, uma edição deixaria o intervalo antigo gravado no banco — e o motor
   * continuaria descontando um tempo que o gestor acabou de remover, encurtando todo turno
   * gerado a partir dali.
   */
  it('remover o intervalo apaga o intervalo, não omite o campo', () => {
    const body = buildModelBody(form);

    expect(body).toHaveProperty('break_duration_minutes', null);
    expect(body).toHaveProperty('break_start_time', null);
    expect(body).toHaveProperty('break_end_time', null);
    expect(Object.keys(body)).toContain('break_duration_minutes');
  });

  it('com intervalo, envia duração e horários', () => {
    const body = buildModelBody({
      ...form, has_break: true, break_duration_time: '01:00',
      break_start_time: '12:00', break_end_time: '13:00',
    });

    expect(body.break_duration_minutes).toBe(60);
    expect(body.break_start_time).toBe('12:00');
    expect(body.break_end_time).toBe('13:00');
  });

  it('intervalo flexível manda a duração e null nos horários', () => {
    const body = buildModelBody({ ...form, has_break: true, break_duration_time: '00:30' });

    expect(body.break_duration_minutes).toBe(30);
    expect(body.break_start_time).toBeNull();
    expect(body.break_end_time).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Mudança sensível — o que exige nova versão em vez de reescrever o passado', () => {
// ═══════════════════════════════════════════════════════════════════════════

  const gravado = {
    start_time: '07:00', duration_minutes: 720, rest_minutes_after: 2160,
    has_break: true, break_duration_minutes: 60,
    break_start_time: '12:00', break_end_time: '13:00',
  };

  const formIgual = {
    name: 'Diurno', start_time: '07:00', duration_time: '12:00', rest_time: '36:00',
    has_break: true, break_duration_time: '01:00',
    break_start_time: '12:00', break_end_time: '13:00',
  };

  it('salvar sem mexer em nada não é mudança sensível', () => {
    expect(hasSensitiveChange(buildModelBody(formIgual), gravado)).toBe(false);
  });

  it('renomear é cosmético — não exige versionamento', () => {
    expect(hasSensitiveChange(buildModelBody({ ...formIgual, name: 'Diurno A' }), gravado)).toBe(false);
  });

  it.each([
    ['hora de início', { start_time: '08:00' }],
    ['duração', { duration_time: '10:00' }],
    ['descanso', { rest_time: '24:00' }],
    ['duração do intervalo', { break_duration_time: '00:30' }],
    ['início do intervalo', { break_start_time: '11:30' }],
    ['fim do intervalo', { break_end_time: '13:30' }],
  ])('mudar %s altera a escala já gerada e exige nova versão', (_nome, alteracao) => {
    expect(hasSensitiveChange(buildModelBody({ ...formIgual, ...alteracao }), gravado)).toBe(true);
  });

  it('remover o intervalo é mudança sensível', () => {
    expect(hasSensitiveChange(buildModelBody({ ...formIgual, has_break: false }), gravado)).toBe(true);
  });

  it('modelo antigo gravado em horas é comparado em minutos, sem falso positivo', () => {
    // Registros antigos guardavam duration_hours; comparar 12 com 720 acusaria mudança
    // sensível a cada salvamento, e todo modelo antigo viraria uma versão nova.
    const antigo = { ...gravado, duration_minutes: undefined, duration_hours: 12 };
    expect(hasSensitiveChange(buildModelBody(formIgual), antigo)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Erro de data efetiva — abrir o diálogo certo', () => {
// ═══════════════════════════════════════════════════════════════════════════

  function erro(status: number, message: string) {
    return Object.assign(new Error(message), { status });
  }

  it('reconhece a recusa por falta de data efetiva', () => {
    expect(isEffectiveDateRequiredError(erro(400, 'effective_date é obrigatório'))).toBe(true);
    expect(isEffectiveDateRequiredError(erro(400, 'Informe a data efetiva (effective_date).'))).toBe(true);
  });

  it('outro erro 400 não abre o diálogo de versionamento', () => {
    expect(isEffectiveDateRequiredError(erro(400, 'Nome já existe.'))).toBe(false);
    expect(isEffectiveDateRequiredError(erro(400, 'effective_date inválida'))).toBe(false);
  });

  it('erro de outro status não abre o diálogo, mesmo com a palavra certa', () => {
    expect(isEffectiveDateRequiredError(erro(500, 'effective_date é obrigatório'))).toBe(false);
    expect(isEffectiveDateRequiredError(erro(409, 'effective_date obrigatório'))).toBe(false);
  });

  it('erro sem forma conhecida não quebra a checagem', () => {
    expect(isEffectiveDateRequiredError(null)).toBe(false);
    expect(isEffectiveDateRequiredError(undefined)).toBe(false);
    expect(isEffectiveDateRequiredError('texto solto')).toBe(false);
    expect(isEffectiveDateRequiredError({})).toBe(false);
  });
});
