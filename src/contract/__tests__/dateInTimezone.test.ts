import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TENANT_TIMEZONE,
  groupShiftsByCell,
  resolveTenantTimezone,
  toDateKeyInTimezone,
} from '@/contract/dateInTimezone';

describe('toDateKeyInTimezone', () => {
  it('uses the tenant calendar day, not the UTC day', () => {
    // 22:00 em Brasília (UTC-3) = 01:00Z do dia seguinte.
    expect(toDateKeyInTimezone('2026-03-15T01:00:00.000Z', 'America/Sao_Paulo')).toBe('2026-03-14');
    expect(toDateKeyInTimezone('2026-03-15T01:00:00.000Z', 'UTC')).toBe('2026-03-15');
    // Meio-dia é o mesmo dia em qualquer fuso brasileiro.
    expect(toDateKeyInTimezone('2026-03-15T15:00:00.000Z', 'America/Manaus')).toBe('2026-03-15');
  });

  it('returns an empty string for invalid or missing values', () => {
    expect(toDateKeyInTimezone(null, 'America/Sao_Paulo')).toBe('');
    expect(toDateKeyInTimezone('not-a-date', 'America/Sao_Paulo')).toBe('');
  });

  it('falls back to the default timezone when the timezone is invalid', () => {
    expect(toDateKeyInTimezone('2026-03-15T01:00:00.000Z', 'Mars/Olympus')).toBe('2026-03-14');
  });
});

describe('resolveTenantTimezone', () => {
  it('returns the configured timezone or the default', () => {
    expect(resolveTenantTimezone({ timezone: 'America/Manaus' })).toBe('America/Manaus');
    expect(resolveTenantTimezone({ timezone: '  ' })).toBe(DEFAULT_TENANT_TIMEZONE);
    expect(resolveTenantTimezone({ timezone: 'Invalid/Zone' })).toBe(DEFAULT_TENANT_TIMEZONE);
    expect(resolveTenantTimezone(undefined)).toBe(DEFAULT_TENANT_TIMEZONE);
  });
});

describe('groupShiftsByCell', () => {
  const shifts = [
    { id: 'b', start_timestamp: '2026-03-15T01:00:00.000Z', location: { id: 'loc-1' } }, // 14/03 22h BRT
    { id: 'a', start_timestamp: '2026-03-15T01:00:00.000Z', location: { id: 'loc-1' } },
    { id: 'c', start_timestamp: '2026-03-14T10:00:00.000Z', location: { id: 'loc-1' } }, // 14/03 07h BRT
    { id: 'd', start_timestamp: '2026-03-15T12:00:00.000Z', location: { id: 'loc-2' } },
    { id: 'e', start_timestamp: null, location: { id: 'loc-2' } },
    { id: 'f', start_timestamp: '2026-03-15T12:00:00.000Z', location: null },
  ];

  it('groups by location + tenant-local day and keeps the backend order (start, id)', () => {
    const map = groupShiftsByCell(shifts, 'America/Sao_Paulo');
    expect(Array.from(map.keys()).sort()).toEqual(['loc-1|2026-03-14', 'loc-2|2026-03-15']);
    expect(map.get('loc-1|2026-03-14')?.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(map.get('loc-1|2026-03-15')).toBeUndefined();
  });

  it('places the same 01:00Z shift on the next day under UTC', () => {
    const map = groupShiftsByCell(shifts, 'UTC');
    expect(map.get('loc-1|2026-03-15')?.map((s) => s.id)).toEqual(['a', 'b']);
    expect(map.get('loc-1|2026-03-14')?.map((s) => s.id)).toEqual(['c']);
  });
});
