export interface User {
  id: string;
  email: string;
  capabilities?: Record<string, boolean>;
  paywall_showcase?: string[];
}

export interface Organization {
  id: string;
  name: string;
  plan: string;
  billing_status: 'SETUP_PENDING' | 'ACTIVE' | 'TRIALING' | 'INACTIVE' | 'PAST_DUE';
  grace_period_ends_at?: string | null;
  /**
   * Quando o acesso acaba — teste grátis ou período contratado que não renova.
   *
   * O status NÃO muda sozinho quando a data passa: quem bloqueia é a comparação com este campo,
   * feita a cada requisição no servidor. Olhar só `billing_status` daria acesso eterno a quem
   * está em teste.
   */
  access_expires_at?: string | null;
  is_setup_ready?: boolean;
  // Whitelist exposta pelo backend em /auth/me (auth.transformer.pickPublicTenantSettings).
  // Nunca inclui settings.billing.
  settings?: {
    timezone?: string;
    onboarding?: Record<string, boolean>;
    holiday_state_code?: string | null;
    holiday_city_ibge_code?: string | null;
    allow_users_view_history?: boolean;
    ui_contextual_guide_hints_enabled?: boolean;
    [key: string]: unknown;
  };
}

export interface BillingInfo {
  plan: string;
  billing_status: string;
  seats_used?: number | null;
  seats_limit?: number | null;
  current_period_end?: string | null;
  free_trial_period?: string | null;
  free_trial_pro_period?: string | null;
  paid_invoice_count?: number | null;
  pro_trial_eligible?: boolean;
  pro_trial_ever_used?: boolean;
  local_pro_trial_active?: boolean;
  local_pro_trial_expires_at?: string | null;
  internal_pro_trial_days?: number | null;
  beta_tester?: boolean;
  beta_free_access_until?: string | null;
  beta_expired?: boolean;
  beta_discount_percent_first_month?: number | null;
  beta_discount_percent_first_year?: number | null;
  beta_discount_scope?: string | null;
  stripe_customer_portal_url?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  has_stripe_customer?: boolean;
  has_stripe_subscription?: boolean;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  data_deletion_scheduled_at?: string | null;
  data_retention_months?: number | null;
}

export interface BetaAccessInfo {
  is_beta_tester: boolean;
  beta_free_access_until?: string | null;
  beta_expired?: boolean;
  has_active_subscription?: boolean;
  discount_percent_first_month?: number;
  discount_percent_first_year?: number;
  discount_scope?: string;
}

export interface AuthData {
  user: User;
  account_status: 'LIMBO' | 'ACTIVE_TENANT';
  organization?: Organization;
  member?: Member | null;
  capabilities?: Record<string, boolean>;
  paywall_showcase?: string[];
  beta_access?: BetaAccessInfo | null;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  accessToken: string;
  data: AuthData;
}

export interface Member {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'USER';
  status: string;
  is_schedulable: boolean;
  permissions?: Permissions;
}

export interface Permissions {
  can_view_sensitive_data?: boolean;
  can_approve_swaps?: boolean;
  can_manage_shifts?: boolean;
  can_manage_tenant?: boolean;
  can_edit_history?: boolean;
  can_manage_workload_policy?: boolean;
}

export interface CustomFieldValue {
  value: unknown;
  is_sensitive: boolean;
  /**
   * Campo sensível cujo valor real fica cifrado no servidor e nunca chega ao navegador
   * (`user.service.js`, que devolve `{ value: null, is_sensitive: true, masked: true }`).
   * Quem edita precisa pular esses campos: gravá-los como string vazia apagaria o dado real.
   */
  masked?: boolean;
}

export interface UserListItem {
  id: string;
  name: string;
  email?: string | null;
  contact_email?: string | null;
  position: string;
  role: 'OWNER' | 'ADMIN' | 'USER';
  status?: 'ACTIVE' | 'PENDING_INVITE' | 'UNREGISTERED';
  is_schedulable: boolean;
  workload_limit_hours?: number | null;
  workload_period?: 'WEEKLY' | 'MONTHLY' | null;
  permissions?: Permissions;
  custom_fields?: Record<string, CustomFieldValue>;
  invite_link?: string | null;
}

export interface Location {
  id: string;
  name: string;
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  pending_deletion?: boolean;
  pending_deletion_effective_date?: string | null;
}

export interface ShiftModel {
  id: string;
  name: string;
  start_time: string;
  duration_hours: number;
  rest_minutes_after: number;
  duration_minutes?: number;
  has_break?: boolean;
  break_duration_minutes?: number | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  is_active?: boolean;
  anchor_id?: string;
  superseded_by_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_ended?: boolean;
  pending_deletion?: boolean;
  pending_deletion_effective_date?: string | null;
  pending_version?: boolean;
  pending_version_effective_date?: string | null;
}

export interface ShiftRequirement {
  id: string;
  anchor_id: string;
  rule_type: 'BASE' | 'OVERLAY';
  superseded_by_id: string | null;
  role: string;
  quantity: number;
  days_of_week: number[];
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  pending_deletion?: boolean;
  pending_deletion_effective_date?: string | null;
  location: Location;
  shift_model: ShiftModel;
  qualification_rules?: import('./qualificationTypes').QualificationRule[];
}

export interface ShiftWarning {
  type: 'HIGH' | 'WARNING' | 'INFO' | 'CRITICAL';
  code: string;
  message: string;
  context?: {
    reason?: string;
    admin?: string;
    old_member?: string;
    new_member?: string;
    [key: string]: unknown;
  };
}

export interface Shift {
  id: string;
  start_timestamp: string;
  end_timestamp: string;
  status: string;
  is_locked_by_admin: boolean;
  warnings: (ShiftWarning | string)[];
  required_role?: string | null;
  qualification_rules?: import('./qualificationTypes').QualificationRule[];
  member?: { id: string; name: string; position?: string | null } | null;
  location: { id: string; name: string };
  shift_model?: { id: string; name: string };
}

export interface Absence {
  id: string;
  user_id: string;
  user_name?: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
}

export interface SetupField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'searchable_select' | 'boolean';
  required?: boolean;
  placeholder?: string;
  description?: string;
  locked_by_plan?: boolean;
  locked_by_policy?: boolean;
  forced_value?: unknown;
  show_on_setup?: boolean;
  default_value?: string | boolean;
  options?: { value: string; label: string }[];
  depends_on?: { key: string; value: unknown } | null;
  required_system_capability?: string;
  group_key?: string;
  group_label?: string;
  group_order?: number;
  group_item_label?: string;
}

export interface MemberCustomFieldSchema {
  key: string;
  label: string;
  is_sensitive: boolean;
}
