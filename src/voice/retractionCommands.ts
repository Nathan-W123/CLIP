/**
 * Detect spoken intent to undo the last voice capture for the current template.
 */

function normalize(transcript: string): string {
  return transcript
    .trim()
    .replace(/[\s.,!?;:'"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const PHRASES = [
  'remove previous entry',
  'delete previous entry',
  'undo previous entry',
  'retract previous entry',
  'remove last entry',
  'delete last entry',
  'undo last entry',
  'retract last entry',
  'remove previous capture',
  'delete last capture',
  'undo last capture',
  'remove the last entry',
  'delete the last entry',
  'undo that entry',
  'never mind remove that',
  'cancel last entry',
  'scratch that last one',
];

const PATTERNS: RegExp[] = [
  /\b(remove|delete|undo|retract|cancel)\b.{0,40}\b(last|previous|prior)\b.{0,20}\b(entry|capture|recording|one)\b/i,
  /\b(remove|delete|undo)\b.{0,12}\b(that|it)\b.{0,12}\b(entry|capture)\b/i,
];

export function isRetractionCommand(transcript: string): boolean {
  const t = normalize(transcript);
  if (!t || t.length < 8) return false;
  if (PHRASES.some(p => t.includes(p))) return true;
  return PATTERNS.some(re => re.test(transcript.trim()));
}
