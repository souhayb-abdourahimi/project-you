/**
 * Explanation attached to every important recommendation ("Pourquoi cette recommandation ?").
 * Values are i18n keys + params so the UI can translate them; never model reasoning.
 */
export interface Rationale {
  goal: string;
  constraints: string[];
  dataUsed: string[];
  reason: string;
  params?: Record<string, string | number>;
}
