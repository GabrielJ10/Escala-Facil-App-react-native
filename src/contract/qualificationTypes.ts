/** Types for the qualification rules builder, driven by backend schema */

export interface QualificationOperator {
  key: string;
  label: string;
  value_type: string; // 'any' | 'number' | 'text' | 'date' | 'list'
}

export interface QualificationWeightBand {
  min: number;
  max: number;
  label: string;
}

export interface QualificationSelectableField {
  key: string;
  label: string;
  is_sensitive: boolean;
}

export interface QualificationBuilderSchema {
  capability_key: string;
  is_enabled: boolean;
  max_rules_per_requirement: number;
  supported_modes: string[]; // e.g. ['HARD', 'SOFT']
  operators: QualificationOperator[];
  soft_weight_bands: QualificationWeightBand[];
  selectable_fields: QualificationSelectableField[];
}

export interface QualificationRule {
  field_key: string;
  operator: string;
  // O valor comparado muda com `value_type` do campo: texto, número, data ou lista. É
  // `unknown` pelo mesmo motivo que `CustomFieldValue.value` em types.ts — quem lê precisa
  // dizer o que espera.
  value: unknown;
  mode: 'HARD' | 'SOFT';
  weight?: number;
  label?: string;
}
