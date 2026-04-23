/**
 * On-device speech-to-text from a local recording file (iOS / Android).
 * Uses expo-speech-recognition — requires a dev build with the config plugin applied.
 */

import { Platform } from 'react-native';
import { getExpoSpeechRecognitionModule } from '../native/expoSpeechRecognitionSafe';

function normalizeFileUri(uri: string): string {
  if (uri.startsWith('file://')) return uri;
  return `file://${uri}`;
}

type Subscription = { remove: () => void };

function addNativeListener<K extends string>(
  eventName: K,
  listener: (ev: unknown) => void,
): Subscription {
  const mod = getExpoSpeechRecognitionModule() as {
    addListener?: (e: K, l: (ev: unknown) => void) => Subscription;
  } | null;
  if (!mod || typeof mod.addListener !== 'function') {
    throw new Error(
      'Speech recognition native module is missing. Rebuild with: npx expo run:ios',
    );
  }
  return mod.addListener(eventName, listener);
}

export type DeviceTranscribeOptions = {
  /** When true, Android may use network speech services if available. */
  online?: boolean;
};

/**
 * Transcribe audio at `uri` using OS speech recognition (works offline when on-device models are available).
 */
export async function transcribeLocalAudioFile(
  uri: string,
  options: DeviceTranscribeOptions = {},
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('On-device file transcription is not supported on web');
  }

  const native = getExpoSpeechRecognitionModule();
  if (!native) {
    throw new Error(
      'On-device speech is not linked in this build. Use a dev client: npx expo run:ios',
    );
  }

  const perm = await native.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Speech recognition permission was not granted');
  }

  if (!native.isRecognitionAvailable()) {
    throw new Error('Speech recognition is not available on this device');
  }

  const fileUri = normalizeFileUri(uri);
  const online = options.online === true;
  let text = '';
  const subs: Subscription[] = [];

  const cleanup = () => {
    subs.forEach(s => {
      try {
        s.remove();
      } catch {
        /* ignore */
      }
    });
  };

  return await new Promise<string>((resolve, reject) => {
    const timeoutMs = 90_000;
    const t = setTimeout(() => {
      cleanup();
      try {
        native.stop();
      } catch {
        /* ignore */
      }
      reject(new Error('On-device transcription timed out'));
    }, timeoutMs);

    const done = (fn: () => void) => {
      clearTimeout(t);
      cleanup();
      try {
        getExpoSpeechRecognitionModule()?.stop();
      } catch {
        /* ignore */
      }
      fn();
    };

    subs.push(
      addNativeListener('result', ev => {
        const e = ev as {
          isFinal?: boolean;
          results?: Array<{ transcript?: string }>;
        };
        const piece = e.results?.[0]?.transcript?.trim() ?? '';
        if (e.isFinal && piece) {
          text = text ? `${text} ${piece}` : piece;
        }
      }),
    );

    subs.push(
      addNativeListener('error', ev => {
        const e = ev as { error?: string; message?: string };
        const code = e.error ?? '';
        if (code === 'no-speech' || code === 'aborted') {
          done(() => resolve(text.trim()));
          return;
        }
        done(() =>
          reject(new Error(e.message || code || 'On-device transcription failed')),
        );
      }),
    );

    subs.push(
      addNativeListener('end', () => {
        done(() => resolve(text.trim()));
      }),
    );

    try {
      native.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: Platform.OS === 'ios' ? true : !online,
        // Let the platform infer format from the file (expo-av typically writes AAC .m4a on Android).
        audioSource: { uri: fileUri },
      });
    } catch (e) {
      done(() =>
        reject(e instanceof Error ? e : new Error(String(e))),
      );
    }
  });
}
