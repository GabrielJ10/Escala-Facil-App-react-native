/**
 * Chaves de calendário no FUSO DO TENANT.
 *
 * `start_timestamp` chega em UTC ("...T01:00:00.000Z"). A matriz da escala agrupava por
 * `substring(0, 10)` (dia UTC): um turno das 22h em Brasília (01:00Z do dia seguinte) caía
 * na coluna errada. Aqui a data-chave é calculada no fuso configurado da organização.
 */
export const DEFAULT_TENANT_TIMEZONE = 'America/Sao_Paulo';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Fuso efetivo a partir de organization.settings (fallback: Brasília). */
export function resolveTenantTimezone(settings?: { timezone?: unknown } | null): string {
  const raw = typeof settings?.timezone === 'string' ? settings.timezone.trim() : '';
  return raw && isValidTimezone(raw) ? raw : DEFAULT_TENANT_TIMEZONE;
}

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TENANT_TIMEZONE;
  let formatter = formatterCache.get(tz);
  if (!formatter) {
    // en-CA formata como YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(tz, formatter);
  }
  return formatter;
}

/** "YYYY-MM-DD" do instante no fuso informado; '' para valores inválidos. */
export function toDateKeyInTimezone(value: string | Date | null | undefined, timezone: string): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getFormatter(timezone).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

type CellShift = {
  id: string;
  start_timestamp?: string | null;
  location?: { id?: string | null } | null;
};

/**
 * Agrupa turnos por célula `${locationId}|${YYYY-MM-DD}` (dia no fuso do tenant), com cada
 * bucket ordenado por (start_timestamp, id) — mesma ordem do backend.
 */
export function groupShiftsByCell<T extends CellShift>(shifts: readonly T[], timezone: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const s of shifts) {
    const dateStr = toDateKeyInTimezone(s.start_timestamp, timezone);
    const locId = s.location?.id;
    if (!dateStr || !locId) continue;
    const key = `${locId}|${dateStr}`;
    const bucket = map.get(key);
    if (bucket) bucket.push(s);
    else map.set(key, [s]);
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => {
      const aStart = a.start_timestamp ?? '';
      const bStart = b.start_timestamp ?? '';
      if (aStart !== bStart) return aStart < bStart ? -1 : 1;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
  }
  return map;
}
