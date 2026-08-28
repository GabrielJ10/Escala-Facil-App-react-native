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
