import NetInfo from '@react-native-community/netinfo';
import { transcribeAudioFile } from '../services/transcribe';
import { transcribeLocalAudioFile } from './deviceTranscribe';

export type TranscribeSource = 'server' | 'device';

/**
 * Prefer Clip FastAPI when online; otherwise (or on failure) use OS on-device file transcription.
 */
export async function transcribeWithFallback(
  uri: string,
  filename: string,
  mimeType: string,
): Promise<{ transcript: string; source: TranscribeSource }> {
  const net = await NetInfo.fetch();
  const online = !!net.isConnected;
  if (online) {
    try {
      const r = await transcribeAudioFile(uri, filename, mimeType);
      const t = r.transcript?.trim() ?? '';
      if (t) return { transcript: r.transcript, source: 'server' };
    } catch {
      /* try device */
    }
  }

  const local = await transcribeLocalAudioFile(uri, { online });
  return { transcript: local, source: 'device' };
}
