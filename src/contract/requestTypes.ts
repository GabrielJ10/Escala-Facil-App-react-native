// Types for Shift Request module

export type RequestType = 'SWAP' | 'COVERAGE';
export type RequestKind = 'SHIFT_SWAP' | 'ABSENCE_REGISTRATION';
/** @deprecated mode removed from backend; kept for legacy response compat */
export type RequestMode = 'EXCHANGE' | 'DOUBLE_COVERAGE';

export type RequestStatus =
  | 'PENDING_TARGET_ACCEPTANCE'
  | 'TARGET_ACCEPTED'
  | 'PENDING_ADMIN_APPROVAL'
  | 'ADMIN_APPROVED'
  | 'EXECUTED'
  | 'ADMIN_REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING_TARGET_ACCEPTANCE: 'Aguardando aceite do colaborador',
  TARGET_ACCEPTED: 'Aceita pelo colaborador',
  PENDING_ADMIN_APPROVAL: 'Aguardando administração',
  ADMIN_APPROVED: 'Aprovada pela administração',
  EXECUTED: 'Executada',
  ADMIN_REJECTED: 'Rejeitada pela administração',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
};

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  PENDING_TARGET_ACCEPTANCE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  TARGET_ACCEPTED: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  PENDING_ADMIN_APPROVAL: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  ADMIN_APPROVED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  EXECUTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  ADMIN_REJECTED: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-muted text-muted-foreground',
};

export interface ShiftSummary {
  id: string;
  start_timestamp: string;
  end_timestamp: string;
  location?: { id: string; name: string };
  shift_model?: { id: string; name: string };
  member?: { id: string; name: string } | null;
}

export interface ShiftRequest {
  id: string;
  type: RequestType;
  mode?: RequestMode;
  status: RequestStatus;
  // Nested (detail endpoint) or flat (list endpoint)
  requester?: { id: string; name: string };
  target?: { id: string; name: string } | null;
  requester_member_id?: string;
  target_member_id?: string;
  source_shift?: ShiftSummary | null;
  target_shift?: ShiftSummary | null;
  source_shift_id?: string;
  target_shift_id?: string;
  preview_snapshot?: {
    warnings?: RequestWarning[];
    source_shift?: { id: string; start_timestamp: string; end_timestamp: string; [k: string]: unknown };
    target_shift?: { id: string; start_timestamp: string; end_timestamp: string; [k: string]: unknown };
    [k: string]: unknown;
  } | null;
  preview_hash?: string | null;
  reason?: string | null;
  created_at: string;
  updated_at: string;
  warnings?: RequestWarning[];
  events?: unknown[];
}

export interface RequestWarning {
  scope?: string;
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  code?: string;
  message: string;
  audience?: 'requester' | 'target' | 'operational';
  title?: string;
  context?: Record<string, unknown>;
  expected_role?: string | null;
  actual_role?: string | null;
  expected_value?: unknown;
  field_key?: string | null;
  operator?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  reason?: string | null;
  member_name?: string | null;
  rest_min?: number;
  required_rest_min?: number;
  overlap_minutes?: number;
  related_shift?: {
    id?: string;
    start_timestamp?: string;
    end_timestamp?: string;
    location_name?: string;
    shift_model_name?: string;
  };
}

export interface PreviewSnapshot {
  preview_hash: string;
  warnings: RequestWarning[];
  impact_summary?: string;
}

// Canonical warning item from 409 confirmation payloads (warnings_preview)
export interface ConfirmationWarningItem {
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  code?: string;
  scope?: string;
  message: string;
  title?: string;
  context?: Record<string, unknown>;
  expected_role?: string | null;
  actual_role?: string | null;
  expected_value?: unknown;
  field_key?: string | null;
  operator?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  reason?: string | null;
  member_name?: string | null;
  rest_min?: number;
  required_rest_min?: number;
  overlap_minutes?: number;
  related_shift?: {
    id?: string;
    start_timestamp?: string;
    end_timestamp?: string;
    location_name?: string;
    shift_model_name?: string;
  };
}

export const SCOPE_LABELS: Record<string, string> = {
  REQUEST_MODE: 'Modo da solicitação',
  SOURCE_SHIFT: 'Turno de origem',
  TARGET_SHIFT: 'Turno de destino',
  OPERATIONAL: 'Operacional',
  REST_AFTER: 'Descanso pós-turno',
  REST_BEFORE: 'Descanso pré-turno',
  OVERLAP: 'Sobreposição',
  QUALIFICATION: 'Qualificação',
  WEEKEND_CONSECUTIVE: 'Fim de semana consecutivo',
  SWAP_WEEKEND_CONSECUTIVE: 'Fim de semana consecutivo (troca)',
};

// ─── UI Label Helpers ─────────────────────────────────────────────────────────

export function mapTypeLabel(type: RequestType): string {
  return type === 'SWAP' ? 'Troca 1:1' : 'Cobertura de turno';
}

/** @deprecated mode removed from backend schema */
export function mapModeLabel(mode: RequestMode): string {
  return mode === 'EXCHANGE' ? 'Transferência de turno' : 'Cobertura dupla';
}

// Dashboard types
export interface DashboardShift {
  id: string;
  start_timestamp: string;
  end_timestamp: string;
  status: string;
  warnings?: unknown[];
  // Backend may return nested objects OR flat IDs depending on version
  location?: { name: string };
  shift_model?: { name: string };
  location_id?: string;
  shift_model_id?: string;
  location_name?: string;
  shift_model_name?: string;
}

export interface MonthlyHours {
  month: string;
  hours?: number;
  worked_hours?: string | number;
  shift_count?: number;
}

export interface DashboardWorkloadWeekBreakdownItem {
  iso_week: string;
  worked_hours: number;
  overtime_hours: number;
}

export interface DashboardWorkload {
  tracking_enabled: boolean;
  enforce_limits?: boolean;
  period: 'WEEKLY' | 'MONTHLY';
  period_key?: string | null;
  timezone?: string;
  contract_limit_hours: number | null;
  worked_hours_current_period: number;
  worked_hours_current_iso_week: number;
  worked_hours_current_month: number;
  overtime_hours_current_period: number;
  overtime_hours_total_period: number;
  overtime_week_hours_current_iso_week: number;
  overtime_weekend_hours_current_period: number;
  overtime_hours_current_month_total: number;
  weekly_reference_limit_hours: number | null;
  weekly_breakdown: DashboardWorkloadWeekBreakdownItem[];
  overtime_warning_threshold_pct: number;
  overtime_warning_threshold_hours: number | null;
  meta?: {
    current_iso_week: string;
    current_month: string;
  };
}

export interface DashboardPeriodInfo {
  period_mode: 'PRESET_DAYS' | 'MONTH' | 'CUSTOM_RANGE' | string;
  period_label?: string;
  range_label?: string;
  selected_start_iso?: string;
  selected_end_iso?: string;
  effective_start_iso?: string;
  effective_end_iso?: string;
  include_future?: boolean;
  reference_month?: string | null;
  preset_days?: number | null;
  range_days?: number;
  effective_range_days?: number;
}

export interface DashboardPeriodSummary {
  total_hours: number;
  worked_hours: number;
  scheduled_hours: number;
  total_shifts: number;
  upcoming_shifts: number;
  past_shifts: number;
}

export interface DashboardPeriodMetrics {
  hours_in_period: number;
  hours_in_period_realized: number;
  hours_in_period_projected: number;
  overtime_hours_in_period: number;
  overtime_hours_in_period_realized: number;
  overtime_hours_in_period_projected: number;
  overtime_limit_hours_in_period: number | null;
  overtime_limit_source?: string;
  workload_contract_period?: 'WEEKLY' | 'MONTHLY' | string | null;
  workload_contract_limit_hours?: number | null;
  workload_limit_configured?: boolean;
}

export interface DashboardData {
  period?: DashboardPeriodInfo;
  summary: {
    total_hours: number;
    worked_hours?: number;
    scheduled_hours?: number;
    total_shifts: number;
    upcoming_shifts: number;
    past_shifts: number;
    open_requests: number;
    pending_action_requests?: number;
    pending_target_actions?: number;
  };
  summary_period?: DashboardPeriodSummary;
  period_metrics?: DashboardPeriodMetrics;
  next_shift: DashboardShift | null;
  upcoming_shifts: DashboardShift[];
  past_shifts: DashboardShift[];
  monthly_hours?: MonthlyHours[];
  monthly_hours_history?: MonthlyHours[];
  workload?: DashboardWorkload | null;
  recent_requests: ShiftRequest[];
  ui?: {
    preview_limits?: { upcoming: number; past: number };
    show_more?: { upcoming: boolean; past: boolean };
  };
  upcoming_modal?: {
    total: number;
    has_more: boolean;
    items: DashboardShift[];
  };
  past_modal?: {
    total: number;
    selected_month: string;
    selected_month_total: number;
    months: { month: string; shift_count: number; worked_hours: number }[];
    has_more: boolean;
    items: DashboardShift[];
  };
}
