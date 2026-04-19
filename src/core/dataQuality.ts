/** Result of stratified stats + Gemma review for database_entry captures. */

export type DataQualitySeverity = 'ok' | 'warn' | 'error';

export type DataQualityIssue = {
  fieldKey: string;
  fieldLabel: string;
  severity: DataQualitySeverity;
  reason: string;
  source: 'stats' | 'gemma' | 'both';
};

export type DataQualityResult = {
  severity: DataQualitySeverity;
  issues: DataQualityIssue[];
  /** Short note for prompts / debugging */
  stratumSummary?: string;
};

export function worstSeverity(
  a: DataQualitySeverity,
  b: DataQualitySeverity,
): DataQualitySeverity {
  const rank: Record<DataQualitySeverity, number> = { ok: 0, warn: 1, error: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function mergeSeverityFromIssues(issues: DataQualityIssue[]): DataQualitySeverity {
  let s: DataQualitySeverity = 'ok';
  for (const i of issues) {
    s = worstSeverity(s, i.severity);
    if (s === 'error') break;
  }
  return s;
}
