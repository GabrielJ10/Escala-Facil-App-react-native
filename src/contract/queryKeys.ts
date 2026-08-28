import type { QueryClient } from '@tanstack/react-query';

// Chaves de query centralizadas e hierárquicas. Incluem o tenant atual como contexto
// (defesa extra; o cache também é totalmente limpo na troca de usuário/tenant — ver AuthContext).
// Datas devem ser strings normalizadas (yyyy-MM-dd) — nunca objetos Date (gerariam keys instáveis).

const t = (tenantId?: string | null) => tenantId ?? 'none';

export const queryKeys = {
  shifts: {
    all: (tenantId?: string | null) => ['shifts', t(tenantId)] as const,
    list: (tenantId: string | null | undefined, start: string, end: string) =>
      ['shifts', t(tenantId), 'list', start, end] as const,
  },
  users: {
    all: (tenantId?: string | null) => ['users', t(tenantId)] as const,
    list: (tenantId?: string | null) => ['users', t(tenantId), 'list'] as const,
  },
  rules: {
    all: (tenantId?: string | null) => ['rules', t(tenantId)] as const,
    locations: (tenantId?: string | null) => ['rules', t(tenantId), 'locations'] as const,
    shiftModels: (tenantId?: string | null) => ['rules', t(tenantId), 'shiftModels'] as const,
    requirements: (tenantId?: string | null) => ['rules', t(tenantId), 'requirements'] as const,
  },
  absences: {
    all: (tenantId?: string | null) => ['absences', t(tenantId)] as const,
    // O status é filtro server-side → entra na key (cada status tem seu próprio cache).
    list: (tenantId: string | null | undefined, status: string) =>
      ['absences', t(tenantId), 'list', status] as const,
    requests: (tenantId?: string | null) => ['absences', t(tenantId), 'requests'] as const,
  },
  userInsights: (tenantId: string | null | undefined, memberId: string, paramsKey: string) =>
    ['userInsights', t(tenantId), memberId, paramsKey] as const,
} as const;

// Helpers de invalidação agrupada (key parcial → invalida todas as filhas).
export function invalidateScheduleQueries(qc: QueryClient, tenantId?: string | null) {
  return qc.invalidateQueries({ queryKey: queryKeys.shifts.all(tenantId) });
}
export function invalidateRulesQueries(qc: QueryClient, tenantId?: string | null) {
  return qc.invalidateQueries({ queryKey: queryKeys.rules.all(tenantId) });
}
export function invalidateUsersQueries(qc: QueryClient, tenantId?: string | null) {
  return qc.invalidateQueries({ queryKey: queryKeys.users.all(tenantId) });
}
export function invalidateAbsenceQueries(qc: QueryClient, tenantId?: string | null) {
  return qc.invalidateQueries({ queryKey: queryKeys.absences.all(tenantId) });
}
