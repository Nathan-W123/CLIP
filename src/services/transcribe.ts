/**
 * HTTP client for the Clip backend (FastAPI).
 * Set EXPO_PUBLIC_API_URL in .env to your Mac's LAN IP when testing on a device/simulator.
 */
import { Platform } from 'react-native';

const DEFAULT_BASE = 'http://127.0.0.1:8000';
let preferredBase: string | null = null;

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE).replace(/\/$/, '');
}

function apiBaseCandidates(): string[] {
  const configured = apiBase();
  const candidates = [configured];
  // iOS Simulator can reach host services via loopback. This avoids stale LAN IP issues.
  if (Platform.OS === 'ios') {
    candidates.push('http://127.0.0.1:8000', 'http://localhost:8000');
  }
  const unique: string[] = [];
  for (const c of candidates) {
    const v = c.replace(/\/$/, '');
    if (!unique.includes(v)) unique.push(v);
  }
  if (preferredBase && unique.includes(preferredBase)) {
    return [preferredBase, ...unique.filter(v => v !== preferredBase)];
  }
  return unique;
}

async function fetchWithBaseFallback(
  path: string,
  init: RequestInit,
): Promise<{ response: Response; base: string }> {
  const bases = apiBaseCandidates();
  const networkErrors: string[] = [];

  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, init);
      preferredBase = base;
      return { response, base };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      networkErrors.push(`${base}${path} -> ${msg}`);
    }
  }

  throw new Error(`Network request failed. Tried: ${networkErrors.join(' | ')}`);
}

// ── /transcribe ───────────────────────────────────────────────────────────────

export type TranscribeResult = {
  transcript: string;
  backend?: string;
};

export async function transcribeAudioFile(
  uri: string,
  filename: string,
  mimeType: string,
): Promise<TranscribeResult> {
  const form = new FormData();
  form.append('file', { uri, name: filename, type: mimeType } as unknown as Blob);

  const { response: res, base } = await fetchWithBaseFallback('/transcribe', {
    method: 'POST',
    body: form as any,
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Bad response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const detail = json.detail;
    throw new Error(
      typeof detail === 'string' ? detail
      : Array.isArray(detail) ? JSON.stringify(detail)
      : `HTTP ${res.status} from ${base}/transcribe`,
    );
  }
  return {
    transcript: typeof json.transcript === 'string' ? json.transcript : '',
    backend: typeof json.backend === 'string' ? json.backend : undefined,
  };
}

// ── /complete (llama.cpp LLM) ─────────────────────────────────────────────────

export type CompleteResult = {
  response: string;
  success: boolean;
};

export async function completeLLM(
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number },
): Promise<CompleteResult> {
  const { response: res, base } = await fetchWithBaseFallback('/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 1024,
    }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof json.detail === 'string' ? json.detail : `HTTP ${res.status} from ${base}/complete`,
    );
  }
  return {
    response: typeof json.response === 'string' ? json.response : '',
    success: json.success === true,
  };
}

// ── /health ───────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<boolean> {
  const bases = apiBaseCandidates();
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/health`, { method: 'GET' });
      if (res.ok) {
        preferredBase = base;
        return true;
      }
    } catch {
      // Try the next base candidate.
    }
  }
  return false;
}

// ── /tts URL builder (used by tts.ts) ────────────────────────────────────────

export function ttsUrl(text: string): string {
  return `${apiBase()}/tts?text=${encodeURIComponent(text)}`;
}
