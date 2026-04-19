import type { SQLiteDatabase } from 'expo-sqlite';
import type { Template } from './schemas';
import type { DataQualityIssue, DataQualityResult, DataQualitySeverity } from './dataQuality';
import { mergeSeverityFromIssues, worstSeverity } from './dataQuality';
import {
  collectStratumNumericSamples,
  extractDatabaseFields,
  isExtremeNumericOutlier,
  numericKeysFromTemplate,
  stratifierKeysFromTemplate,
  summarizeSamplesForPrompt,
} from '../services/stratumStats';

function extractJsonObject(text: string): string {
  let t = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)```$/m.exec(t);
  if (fenced) {
    t = fenced[1].trim();
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
}

function parseNumeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fieldLabel(template: Template, key: string): string {
  if (template.type !== 'database_entry') return key;
  const d = template.schemaDefinition?.find(x => x.key === key);
  return d?.label ?? key;
}

type CompleteFn = (args: {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  options?: { temperature?: number; maxTokens?: number };
}) => Promise<{ success: boolean; response?: string }>;

function mergeIssuesByField(
  stat: DataQualityIssue[],
  gemma: DataQualityIssue[],
): DataQualityIssue[] {
  const map = new Map<string, DataQualityIssue>();
  for (const i of [...stat, ...gemma]) {
    const prev = map.get(i.fieldKey);
    if (!prev) {
      map.set(i.fieldKey, { ...i });
      continue;
    }
    map.set(i.fieldKey, {
      fieldKey: i.fieldKey,
      fieldLabel: prev.fieldLabel || i.fieldLabel,
      severity: worstSeverity(prev.severity, i.severity),
      reason: prev.reason === i.reason ? prev.reason : `${prev.reason} · ${i.reason}`,
      source:
        prev.source !== i.source ? 'both' : prev.source === 'both' ? 'both' : i.source,
    });
  }
  return [...map.values()];
}

type GemmaJson = {
  severity?: string;
  issues?: Array<{
    fieldKey?: string;
    fieldLabel?: string;
    severity?: string;
    reason?: string;
  }>;
};

function normalizeSeverity(s: string | undefined): DataQualitySeverity {
  if (s === 'error' || s === 'warn' || s === 'ok') return s;
  return 'ok';
}

export async function runDataQualityAnalysis(
  complete: CompleteFn,
  template: Template,
  payload: unknown,
  db: SQLiteDatabase,
  options?: { excludeCaptureId?: string; skipGemma?: boolean },
): Promise<DataQualityResult> {
  const fields = extractDatabaseFields(payload);
  if (!fields || template.type !== 'database_entry') {
    return { severity: 'ok', issues: [] };
  }

  const stratKeys = stratifierKeysFromTemplate(template);
  const numericKeys = numericKeysFromTemplate(template);

  if (numericKeys.length === 0) {
    return { severity: 'ok', issues: [] };
  }

  const statIssues: DataQualityIssue[] = [];
  const summaries: string[] = [];

  for (const nk of numericKeys) {
    const samples = await collectStratumNumericSamples(
      db,
      template.id,
      fields,
      nk,
      stratKeys,
      options?.excludeCaptureId,
    );
    const cv = parseNumeric(fields[nk]);
    summaries.push(
      summarizeSamplesForPrompt(fieldLabel(template, nk), samples),
    );
    if (cv === null) continue;

    if (samples.length >= 4 && isExtremeNumericOutlier(samples, cv)) {
      statIssues.push({
        fieldKey: nk,
        fieldLabel: fieldLabel(template, nk),
        severity: 'error',
        reason: `Value ${cv} looks extreme vs ${samples.length} prior entries in this same category bucket (column distribution).`,
        source: 'stats',
      });
    }
  }

  const stratumSummary = [
    stratKeys.length > 0
      ? `Category keys (bucket together): ${stratKeys.join(', ')}`
      : 'No text bucket keys — comparing to all prior rows for this template.',
    ...summaries,
  ].join('\n');

  if (options?.skipGemma) {
    return {
      severity: mergeSeverityFromIssues(statIssues),
      issues: statIssues,
      stratumSummary,
    };
  }

  let gemmaIssues: DataQualityIssue[] = [];
  try {
    const system = `You review structured inventory or field-survey rows. Numeric fields MUST be judged within the SAME CATEGORY as other text attributes (e.g. same product type), not vs unrelated items.
Respond with ONLY valid JSON (no markdown):
{"severity":"ok"|"warn"|"error","issues":[{"fieldKey":"string","fieldLabel":"string","severity":"ok"|"warn"|"error","reason":"string"}]}
Use severity "error" only for clearly impossible or absurd numbers vs the bucket context; "warn" for suspicious; "ok" if plausible.`;

    const user = `Template: ${template.name} (${template.id})
Bucket / stratification: ${stratKeys.length ? stratKeys.join(', ') : '(none — global for this template)'}
Current fields: ${JSON.stringify(fields)}

Within-bucket numeric history (same text attributes as this row):
${summaries.join('\n')}

Automatic statistical flags (may have false positives):
${statIssues.length ? statIssues.map(s => `- ${s.fieldKey}: ${s.reason}`).join('\n') : '- none'}

Re-check whether flagged numerics are truly wrong given category context, or dismiss false alarms.`;

    const result = await complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      options: { temperature: 0, maxTokens: 512 },
    });

    if (result.success && result.response) {
      const parsed = JSON.parse(extractJsonObject(result.response)) as GemmaJson;
      const gIssues = Array.isArray(parsed.issues) ? parsed.issues : [];
      for (const gi of gIssues) {
        if (!gi.fieldKey || !gi.reason) continue;
        gemmaIssues.push({
          fieldKey: gi.fieldKey,
          fieldLabel: gi.fieldLabel ?? fieldLabel(template, gi.fieldKey),
          severity: normalizeSeverity(gi.severity),
          reason: gi.reason,
          source: 'gemma',
        });
      }
    }
  } catch {
    gemmaIssues = [];
  }

  const merged = mergeIssuesByField(statIssues, gemmaIssues);

  return {
    severity: mergeSeverityFromIssues(merged),
    issues: merged,
    stratumSummary,
  };
}
