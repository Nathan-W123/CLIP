import type { Template } from './schemas';

/** Parsed JSON emitted by on-device LM; discriminated by `kind` matching template.type. */
export type ChecklistPayload = {
  kind: 'checklist';
  steps?: Array<{ id?: string; title?: string; notes?: string; completed?: boolean }>;
  summary?: string;
};

export type NotesPayload = {
  kind: 'notes';
  body: string;
  title?: string;
};

export type DatabaseEntryPayload = {
  kind: 'database_entry';
  fields: Record<string, string | number | boolean | null>;
};

export type ParsedPayload = ChecklistPayload | NotesPayload | DatabaseEntryPayload;

export type PayloadValidation =
  | { ok: true; payload: ParsedPayload }
  | { ok: false; reason: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate model output and coerce into ParsedPayload; template drives expected `kind`. */
export function validateParsedPayload(template: Template, raw: unknown): PayloadValidation {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'expected object' };
  }

  const kind = raw.kind;
  if (template.type === 'checklist') {
    if (kind !== 'checklist') {
      return { ok: false, reason: `expected kind checklist, got ${String(kind)}` };
    }
    const steps = raw.steps;
    const summary = typeof raw.summary === 'string' ? raw.summary : undefined;
    if (steps !== undefined && !Array.isArray(steps)) {
      return { ok: false, reason: 'steps must be an array' };
    }
    return {
      ok: true,
      payload: {
        kind: 'checklist',
        steps: Array.isArray(steps)
          ? steps.map(s =>
              isPlainObject(s)
                ? {
                    id: typeof s.id === 'string' ? s.id : undefined,
                    title: typeof s.title === 'string' ? s.title : '',
                    notes: typeof s.notes === 'string' ? s.notes : undefined,
                    completed: typeof s.completed === 'boolean' ? s.completed : undefined,
                  }
                : { title: '' },
            )
          : undefined,
        summary,
      },
    };
  }

  if (template.type === 'notes') {
    if (kind !== 'notes') {
      return { ok: false, reason: `expected kind notes, got ${String(kind)}` };
    }
    const body = raw.body;
    if (typeof body !== 'string' || !body.trim()) {
      return { ok: false, reason: 'notes payload needs non-empty body string' };
    }
    return {
      ok: true,
      payload: {
        kind: 'notes',
        body: body.trim(),
        title: typeof raw.title === 'string' ? raw.title : undefined,
      },
    };
  }

  if (template.type === 'database_entry') {
    if (kind !== 'database_entry') {
      return { ok: false, reason: `expected kind database_entry, got ${String(kind)}` };
    }
    const fields = raw.fields;
    if (!isPlainObject(fields)) {
      return { ok: false, reason: 'fields must be an object' };
    }
    const out: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = v;
      } else if (typeof v === 'object') {
        out[k] = JSON.stringify(v);
      } else {
        out[k] = String(v);
      }
    }
    return { ok: true, payload: { kind: 'database_entry', fields: out } };
  }

  return { ok: false, reason: 'unknown template type' };
}

/** When LM output is garbage, store transcript as a minimal notes-shaped payload (still JSON in DB). */
export function fallbackPayload(template: Template, transcript: string): ParsedPayload {
  const t = transcript.trim() || '(empty)';
  switch (template.type) {
    case 'checklist':
      return { kind: 'checklist', summary: t, steps: [] };
    case 'notes':
      return { kind: 'notes', body: t };
    case 'database_entry':
      return { kind: 'database_entry', fields: { raw: t } };
    default:
      return { kind: 'notes', body: t };
  }
}
