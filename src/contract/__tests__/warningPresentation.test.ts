import { describe, expect, it } from 'vitest';
import { presentWarning, buildAssignmentWarningSummary, countCriticalWarnings, type WarningLike } from '@/contract/warningPresentation';

// Helper de fixture: evita `any` mantendo a tipagem do presenter.
const w = (obj: Record<string, unknown>): WarningLike => obj as unknown as WarningLike;
const ws = (arr: Record<string, unknown>[]): WarningLike[] => arr as unknown as WarningLike[];

describe('presentWarning — ABSENT', () => {
  it('formata datas em pt-BR e nunca expõe GMT/Date.toString', () => {
    const p = presentWarning(w({
      type: 'CRITICAL',
      code: 'ABSENT',
      message: 'Funcionário está em afastamento ativo neste período.',
      start_date: '2026-06-22',
      end_date: '2026-06-23',
      reason: 'Atestado',
    }));

    expect(p.title).toBe('Funcionário em afastamento');
    expect(p.description).toContain('22/06/2026 até 23/06/2026');
    expect(p.description).not.toMatch(/GMT/);
    expect(JSON.stringify(p)).not.toMatch(/GMT/);
    expect(p.details).toContainEqual({ label: 'Período', value: '22/06/2026 até 23/06/2026' });
    expect(p.details).toContainEqual({ label: 'Motivo', value: 'Atestado' });
  });

  it('extrai datas de mensagem legada com GMT como fallback', () => {
    const p = presentWarning(w({
      type: 'CRITICAL',
      code: 'ABSENT',
      message:
        'Funcionário está em afastamento ativo neste período (Mon Jun 22 2026 00:00:00 GMT+0000 (Coordinated Universal Time) até Tue Jun 23 2026 23:59:59 GMT+0000 (Coordinated Universal Time)).',
    }));

    expect(p.description).toContain('22/06/2026 até 23/06/2026');
    expect(p.description).not.toMatch(/GMT/);
  });

  it('formata corretamente quando start_date/end_date chegam como objeto Date (caminho getUTC*)', () => {
    const p = presentWarning(w({
      type: 'CRITICAL',
      code: 'ABSENT',
      message: 'Funcionário está em afastamento ativo neste período.',
      start_date: new Date('2026-06-22T00:00:00.000Z'),
      end_date: new Date('2026-06-23T23:59:59.999Z'),
    }));

    // Lê componentes em UTC → sem off-by-one independente do fuso do runner.
    expect(p.description).toContain('22/06/2026 até 23/06/2026');
    expect(p.details).toContainEqual({ label: 'Período', value: '22/06/2026 até 23/06/2026' });
  });
});

describe('presentWarning — ROLE_MISMATCH', () => {
  it('usa cargos estruturados e não renderiza "HARD"', () => {
    const p = presentWarning(w({
      type: 'CRITICAL',
      code: 'ROLE_MISMATCH_HARD',
      message: 'Cargo diferente do necessário para este turno.',
      expected_role: 'PADEIRO',
      actual_role: 'Padeira',
    }));

    expect(p.title).toBe('Cargo diferente do necessário');
    expect(p.description).toContain('PADEIRO');
    expect(p.description).toContain('Padeira');
    expect(JSON.stringify(p)).not.toMatch(/\bHARD\b/);
    expect(p.details).toContainEqual({ label: 'Vaga', value: 'PADEIRO' });
    expect(p.details).toContainEqual({ label: 'Selecionado', value: 'Padeira' });
  });

  it('extrai cargos da mensagem legada quando não há campos estruturados', () => {
    const p = presentWarning(w({
      type: 'CRITICAL',
      code: 'ROLE_MISMATCH_HARD',
      message: 'Desvio de funcao: cargo necessario PADEIRO; funcionario selecionado e Padeira.',
    }));

    expect(p.description).toContain('PADEIRO');
    expect(p.description).toContain('Padeira');
  });
});

describe('presentWarning — fallback e qualificação', () => {
  it('nunca renderiza "HARD" cru no fallback de qualificação', () => {
    const p = presentWarning(w({
      type: 'CRITICAL',
      code: 'QUALIFICATION_HARD',
      message: 'Regra obrigatória de qualificação não atendida: idade >= 18.',
    }));

    expect(p.title).toBe('Critério obrigatório não atendido');
    expect(p.description).toBe('idade >= 18.');
    expect(JSON.stringify(p)).not.toMatch(/\bHARD\b/);
  });

  it('código desconhecido tem fallback seguro (sem crash)', () => {
    const p = presentWarning(w({ type: 'WARNING', code: 'SOMETHING_NEW', message: 'Mensagem genérica.' }));
    expect(p.title).toBeTruthy();
    expect(p.description).toBe('Mensagem genérica.');
  });

  it('warning sem mensagem não quebra', () => {
    const p = presentWarning(w({ type: 'INFO' }));
    expect(p.title).toBeTruthy();
    expect(p.description).toBeTruthy();
  });
});

describe('resumos do modal', () => {
  it('conta apenas warnings CRITICAL', () => {
    const warnings = ws([
      { type: 'CRITICAL', code: 'ABSENT', message: 'x' },
      { type: 'WARNING', code: 'QUALIFICATION_SOFT', message: 'y' },
    ]);
    expect(countCriticalWarnings(warnings)).toBe(1);
  });

  it('resumo plural/singular e tom crítico', () => {
    const critical = ws([{ type: 'CRITICAL', code: 'ABSENT', message: 'x' }]);
    expect(buildAssignmentWarningSummary(critical)).toContain('1 ponto');
    expect(buildAssignmentWarningSummary(critical)).toMatch(/impedir/);

    const soft = ws([
      { type: 'WARNING', code: 'A', message: 'x' },
      { type: 'WARNING', code: 'B', message: 'y' },
    ]);
    expect(buildAssignmentWarningSummary(soft)).toContain('2 pontos');
  });
});

/**
 * Os ramos que o `presentWarning` tinha e ninguém exercitava.
 *
 * Foram descobertos por acaso: o SonarJS acusou complexidade 23 na função, e ao medir o que
 * um refactor quebraria apareceu que metade dos ramos não tinha teste nenhum. Estes casos
 * foram escritos **contra o código como ele era**, antes de qualquer mudança — é o que
 * transforma o refactor numa reorganização verificável em vez de uma aposta.
 */
describe('presentWarning — ramos por código', () => {
  it('HOLIDAY casa por conteúdo, não por igualdade', () => {
    for (const code of ['HOLIDAY', 'HOLIDAY_BLOCK', 'SHIFT_ON_HOLIDAY_FORCED']) {
      const p = presentWarning(w({ type: 'WARNING', code, message: 'Dia bloqueado.' }));
      expect(p.title).toBe('Turno em folga ou feriado');
      expect(p.consequence).toContain('dia bloqueado');
    }
  });

  it('LOCKED_SHIFT casa por conteúdo', () => {
    for (const code of ['LOCKED_SHIFT', 'LOCKED_SHIFT_CONFIRMATION']) {
      const p = presentWarning(w({ type: 'WARNING', code, message: 'Turno travado.' }));
      expect(p.title).toBe('Turno bloqueado manualmente');
    }
  });

  /**
   * A ordem dos ramos é comportamento, não estilo: um aviso de feriado que também traga
   * `overlap_minutes` tem que continuar saindo como feriado. Sem esta asserção, reordenar a
   * função — que é exatamente o que um refactor faz — trocaria o título na tela sem nenhum
   * teste reclamar.
   */
  it('o código vence os campos numéricos quando os dois estão presentes', () => {
    const p = presentWarning(w({
      type: 'WARNING', code: 'HOLIDAY', message: 'x', overlap_minutes: 30, rest_min: 4,
    }));
    expect(p.title).toBe('Turno em folga ou feriado');
  });

  it('ROLE_MISMATCH sem sufixo cai no mesmo ramo do HARD', () => {
    const p = presentWarning(w({
      type: 'WARNING', code: 'ROLE_MISMATCH', message: 'x',
      expected_role: 'Padeiro', actual_role: 'Caixa',
    }));
    expect(p.title).toBe('Cargo diferente do necessário');
    expect(p.details).toEqual([
      { label: 'Vaga', value: 'Padeiro' },
      { label: 'Selecionado', value: 'Caixa' },
    ]);
  });
});

describe('presentWarning — ramos por campo, quando não há código conhecido', () => {
  it('overlap_minutes vira sobreposição de horário', () => {
    const p = presentWarning(w({ type: 'WARNING', code: 'X', message: 'Conflito.', overlap_minutes: 45 }));
    expect(p.title).toBe('Sobreposição de horário');
  });

  /**
   * `0` é um valor legítimo — sobreposição de zero minuto é o caso de encaixe exato — e a
   * função testa `!== undefined` justamente por isso. Um refactor que trocasse para `if
   * (warning.overlap_minutes)` passaria em todos os outros testes e perderia este.
   */
  it('overlap_minutes igual a zero ainda conta', () => {
    const p = presentWarning(w({ type: 'WARNING', code: 'X', message: 'Encaixe.', overlap_minutes: 0 }));
    expect(p.title).toBe('Sobreposição de horário');
  });

  it('rest_min e required_rest_min viram descanso abaixo do ideal', () => {
    expect(presentWarning(w({ type: 'WARNING', code: 'X', message: 'y', rest_min: 6 })).title)
      .toBe('Descanso entre turnos abaixo do ideal');
    expect(presentWarning(w({ type: 'WARNING', code: 'X', message: 'y', required_rest_min: 11 })).title)
      .toBe('Descanso entre turnos abaixo do ideal');
  });

  it('rest_min igual a zero ainda conta', () => {
    expect(presentWarning(w({ type: 'WARNING', code: 'X', message: 'y', rest_min: 0 })).title)
      .toBe('Descanso entre turnos abaixo do ideal');
  });

  it('sobreposição é avaliada antes do descanso', () => {
    const p = presentWarning(w({
      type: 'WARNING', code: 'X', message: 'y', overlap_minutes: 30, rest_min: 4,
    }));
    expect(p.title).toBe('Sobreposição de horário');
  });

  /**
   * O fallback é o único ramo que devolve um objeto **sem** `consequence`. Fixar isso importa
   * porque a tela decide se mostra a linha de consequência pela ausência do campo.
   */
  it('o fallback usa o título do aviso e não tem consequência', () => {
    const p = presentWarning(w({ type: 'INFO', code: 'DESCONHECIDO', title: 'aviso qualquer', message: 'Algo.' }));
    expect(p.title).toBe('Aviso qualquer');
    expect(p.consequence).toBeUndefined();
    expect(p.details).toEqual([]);
  });
});
