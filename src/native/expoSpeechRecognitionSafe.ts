/**
 * Optional load of expo-speech-recognition. Prevents crash when the native module
 * is missing (Expo Go, or iOS/Android not rebuilt after adding the dependency).
 */
import { useEventListener } from 'expo';
import { useRef } from 'react';

export type ExpoSpeechRecognitionModuleSafe = {
  addListener: (event: string, listener: (ev: unknown) => void) => { remove: () => void };
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  isRecognitionAvailable: () => boolean;
};

let cached: ExpoSpeechRecognitionModuleSafe | null | undefined;

export function getExpoSpeechRecognitionModule(): ExpoSpeechRecognitionModuleSafe | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    // Metro resolves this; native side may still be absent until `expo run:ios` / prebuild.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('expo-speech-recognition') as {
      ExpoSpeechRecognitionModule?: ExpoSpeechRecognitionModuleSafe;
    };
    cached = pkg.ExpoSpeechRecognitionModule ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

export function isSpeechRecognitionNativeAvailable(): boolean {
  return getExpoSpeechRecognitionModule() !== null;
}

/** Stable no-op emitter so `useEventListener` can run when the native module is absent. */
const noopSpeechEmitter: Pick<ExpoSpeechRecognitionModuleSafe, 'addListener'> = {
  addListener() {
    return { remove: () => {} };
  },
};

/**
 * Same behavior as `expo-speech-recognition`'s `useSpeechRecognitionEvent`, but safe when
 * the native module is missing. Uses Expo's `useEventListener` so subscriptions match
 * the real `ExpoSpeechRecognition` native module (same as the upstream package).
 */
export function useSpeechRecognitionEvent(
  eventName: string,
  listener: (ev: unknown) => void,
): void {
  const mod = getExpoSpeechRecognitionModule();
  const emitter = mod?.addListener ? mod : noopSpeechEmitter;
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEventListener(emitter as never, eventName as never, ((payload: unknown) => {
    listenerRef.current(payload);
  }) as never);
}
