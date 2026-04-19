import type { Template } from './schemas';
import type { ParsedPayload } from './payloadValidation';

/** Match template rows (including SQLite) when id omits `master-` prefix. */
function inferMasterSchemaId(template: Template): string | null {
  if (template.type !== 'database_entry' || !template.schemaDefinition?.length) return null;
  const keys = new Set(template.schemaDefinition.map(f => f.key));
  if (keys.has('dolphin_count') && keys.has('observation_type')) return 'dolphin_observations';
  if (keys.has('coral_cover_pct') || (keys.has('site_area') && keys.has('transect')))
    return 'coral_reef_health';
  return null;
}

/** Apply enrichment when template maps to a master schema (by id or by column keys). */
export function applyMasterEnrichmentIfNeeded(
  template: Template,
  transcript: string,
  payload: ParsedPayload,
): ParsedPayload {
  let schemaId: string | null = null;
  if (template.type === 'database_entry' && template.id.startsWith('master-')) {
    schemaId = template.id.slice('master-'.length);
  }
  if (!schemaId) {
    schemaId = inferMasterSchemaId(template);
  }
  if (!schemaId) return payload;
  return enrichParsedPayloadForMaster(schemaId, transcript.trim(), payload);
}

const WORD_NUM: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const SPOKEN_NUM_WORDS = Object.keys(WORD_NUM)
  .filter(k => k !== 'zero')
  .join('|');

function parseSpokenInt(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  }
  const w = WORD_NUM[t];
  return w !== undefined ? w : null;
}

/**
 * Fills `database_entry.fields` from transcript when the LM missed values.
 * Keeps existing non-empty model fields unless they look like placeholders.
 */
export function enrichParsedPayloadForMaster(
  schemaId: string,
  transcript: string,
  payload: ParsedPayload,
): ParsedPayload {
  if (payload.kind !== 'database_entry') return payload;
  const fields = { ...payload.fields };

  switch (schemaId) {
    case 'dolphin_observations':
      return {
        kind: 'database_entry',
        fields: enrichDolphinObservationFields(transcript, fields),
      };
    default:
      return payload;
  }
}

function enrichDolphinObservationFields(
  transcript: string,
  fields: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = { ...fields };
  const t = transcript.trim();

  const needsCount =
    out.dolphin_count == null ||
    (typeof out.dolphin_count === 'string' && out.dolphin_count.trim() === '') ||
    (typeof out.dolphin_count === 'number' && !Number.isFinite(out.dolphin_count));

  if (needsCount) {
    const numOrWord = `(\\d+|${SPOKEN_NUM_WORDS})`;
    const patterns = [
      new RegExp(`\\b(?:pod\\s*of)\\s*${numOrWord}\\b`, 'i'),
      new RegExp(`\\b${numOrWord}\\s+dolphins?\\b`, 'i'),
      new RegExp(`\\b${numOrWord}\\s+dolphin\\b`, 'i'),
    ];
    for (const re of patterns) {
      const m = re.exec(t);
      if (m) {
        const n = parseSpokenInt(m[1]);
        if (n !== null) {
          out.dolphin_count = n;
          break;
        }
      }
    }
  }

  const locEmpty =
    out.location == null ||
    out.location === '' ||
    (typeof out.location === 'string' && !out.location.trim());
  if (locEmpty) {
    const numOrWord = `(\\d+|${SPOKEN_NUM_WORDS})`;
    const locPatterns = [
      new RegExp(`\\blocation\\s*(?:number\\s*)?${numOrWord}\\b`, 'i'),
      new RegExp(`\\bnear\\s+location\\s*${numOrWord}\\b`, 'i'),
      new RegExp(`\\bat\\s+location\\s*${numOrWord}\\b`, 'i'),
    ];
    for (const re of locPatterns) {
      const m = re.exec(t);
      if (m) {
        const loc = parseSpokenInt(m[1]);
        out.location = loc !== null ? String(loc) : m[1];
        break;
      }
    }
  }

  const typeEmpty =
    !out.observation_type ||
    (typeof out.observation_type === 'string' && !out.observation_type.trim());
  if (typeEmpty && /dolphin/i.test(t)) {
    out.observation_type = 'dolphin';
  }

  const buoyWasEmpty =
    out.buoy == null ||
    out.buoy === '' ||
    (typeof out.buoy === 'string' && !out.buoy.trim());
  if (buoyWasEmpty) {
    const numOrWord = `(\\d+|${SPOKEN_NUM_WORDS})`;
    const m = new RegExp(`\\bbuoy\\s*${numOrWord}\\b`, 'i').exec(t);
    if (m) {
      const b = parseSpokenInt(m[1]);
      out.buoy = b !== null ? String(b) : m[1];
    }
  }
  const buoyStillEmpty =
    out.buoy == null ||
    out.buoy === '' ||
    (typeof out.buoy === 'string' && !out.buoy.trim());
  if (
    buoyStillEmpty &&
    typeof out.location === 'string' &&
    out.location.trim()
  ) {
    out.buoy = out.location.trim();
  }

  delete (out as Record<string, unknown>).raw;

  return out;
}
