/**
 * POST multipart audio to the Clip STT backend (FastAPI `/transcribe`).
 * Set EXPO_PUBLIC_API_URL in `.env` to your Mac's LAN IP when testing on device/simulator.
 */
const DEFAULT_BASE = 'http://127.0.0.1:8000';

function apiBase(): string {
  const b = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE;
  return b.replace(/\/$/, '');
}

export type TranscribeResult = {
  transcript: string;
  backend?: string;
  model?: string;
};

export async function transcribeAudioFile(
  uri: string,
  filename: string,
  mimeType: string,
): Promise<TranscribeResult> {
  const endpoint = `${apiBase()}/transcribe`;
  const form = new FormData();
  // React Native FormData file part (not web Blob)
  form.append('file', {
    uri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(endpoint, {
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
    const msg =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? JSON.stringify(detail)
          : text;
    throw new Error(msg || `HTTP ${res.status}`);
  }

  const transcript = typeof json.transcript === 'string' ? json.transcript : '';
  return {
    transcript,
    backend: typeof json.backend === 'string' ? json.backend : undefined,
    model: typeof json.model === 'string' ? json.model : undefined,
  };
}

export async function fetchHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
