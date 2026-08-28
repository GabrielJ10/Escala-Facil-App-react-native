import { describe, expect, it } from 'vitest';
import { formatCpfInput, normalizeCpf, validateCpf } from '@/contract/cpf';

describe('cpf helpers', () => {
  it('normalizes cpf to digits', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('validates a known valid cpf', () => {
    expect(validateCpf('529.982.247-25')).toBe(true);
  });

  it('rejects repeated sequence cpf', () => {
    expect(validateCpf('111.111.111-11')).toBe(false);
  });

  it('formats cpf input mask', () => {
    expect(formatCpfInput('52998224725')).toBe('529.982.247-25');
  });
});
