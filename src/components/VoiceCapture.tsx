// Push-to-toggle continuous capture: native speech recognition finalizes each phrase;
// each phrase is parsed and saved without a separate "stop" per entry. Tap again to end.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Pressable, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import {
  getExpoSpeechRecognitionModule,
  isSpeechRecognitionNativeAvailable,
  useSpeechRecognitionEvent,
} from '../native/expoSpeechRecognitionSafe';
import { useVoiceParser } from '../voice/useVoiceParser';
import { isRetractionCommand } from '../voice/retractionCommands';
import { transcribeWithFallback } from '../voice/transcribeWithFallback';
import { startRecording, stopRecording, requestMicPermission, type ActiveRecording } from '../voice/audio';
import { insertCapture } from '../db/capturesRepository';
import { flushPendingCaptures, trySyncCaptures } from '../services/syncCaptures';
import { retractLastVoiceEntry } from '../services/retractCapture';
import { speakText } from '../services/tts';
import { speakSavedCaptureFeedback } from '../services/postCaptureSpeech';
import { validateRecord } from '../core/validation';
import { fetchHealth } from '../services/transcribe';
import { parseTranscriptHeuristic } from '../voice/offlineParse';
import { createWebSpeechLiveSession, isWebSpeechRecognitionSupported } from '../voice/webSpeechLive';
import { Images } from '../assets/images';
import type { Template, ClipRecord } from '../core/schemas';
import { randomUuid } from '../utils/randomUuid';

/** Some RN / bridge paths wrap the payload; normalize before reading fields. */
function unwrapNativeSpeechPayload(ev: unknown): unknown {
  if (typeof ev !== 'object' || ev === null) return ev;
  const ne = (ev as { nativeEvent?: unknown }).nativeEvent;
  return ne !== undefined && ne !== null ? ne : ev;
}

function buildReprompt(template: Template): string {
  if (template.type === 'database_entry') {
    const fields =
      'schemaDefinition' in template && template.schemaDefinition.length > 0
        ? template.schemaDefinition.map(f => f.label).join(', ')
        : 'the required fields';
    return `That didn't sound like a ${template.name} entry. Please say ${fields}.`;
  }
  if (template.type === 'checklist') {
    return `That didn't sound like a checklist step. Try describing what you just completed.`;
  }
  return `That didn't sound like a valid entry for ${template.name}. Please try again.`;
}

/**
 * Live caption: prefer latest hypothesis (often freshest on Android).
 * Final parse queue: prefer `results[0]` (segment for this utterance per expo-speech-recognition).
 */
function pieceFromNativeSpeechResultEvent(ev: unknown): {
  displayText: string;
  segmentForEnqueue: string;
  isFinal: boolean;
} {
  if (typeof ev !== 'object' || ev === null) {
    return { displayText: '', segmentForEnqueue: '', isFinal: false };
  }
  const e = ev as {
    isFinal?: boolean;
    results?: Array<{ transcript?: string; segments?: Array<{ segment?: string }> }>;
  };
  const rows = Array.isArray(e.results) ? e.results : [];
  const textFromRow = (r: (typeof rows)[0] | undefined): string => {
    if (!r) return '';
    const t = typeof r.transcript === 'string' ? r.transcript.trim() : '';
    if (t) return t;
    const segs = Array.isArray(r.segments) ? r.segments : [];
    return segs
      .map(s => (typeof s.segment === 'string' ? s.segment.trim() : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
  };
  const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const first = rows[0];
  const tLast = textFromRow(last);
  const tFirst = textFromRow(first);
  const displayText = (tLast || tFirst).trim();
  const segmentForEnqueue = (tFirst || tLast).trim();
  return { displayText, segmentForEnqueue, isFinal: Boolean(e.isFinal) };
}

interface Props {
  template: Template;
  onSaved?: (record: ClipRecord) => void;
}

type CaptureState = 'idle' | 'listening' | 'recording' | 'parsing' | 'saving';

const NATIVE_CONTINUOUS =
  (Platform.OS === 'ios' || Platform.OS === 'android') && isSpeechRecognitionNativeAvailable();

export function VoiceCapture({ template, onSaved }: Props) {
  const db = useSQLiteContext();
  const { isReady, isLoading, parseTranscript, error: backendError } = useVoiceParser();
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [activeRecording, setActiveRecording] = useState<ActiveRecording | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [segmentBusy, setSegmentBusy] = useState(false);

  const captureStateRef = useRef(captureState);
  captureStateRef.current = captureState;

  const dedupeRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const queueRef = useRef<string[]>([]);
  const drainLockRef = useRef(false);
  const webSpeechSessionRef = useRef<ReturnType<typeof createWebSpeechLiveSession> | null>(null);
  /** Finalized phrases this listening session (live UI when OS sends sparse partials). */
  const listeningRollupRef = useRef('');

  const stopNativeListening = useCallback(() => {
    const mod = getExpoSpeechRecognitionModule();
    if (mod) {
      try {
        mod.stop();
      } catch {
        /* ignore */
      }
    }
    captureStateRef.current = 'idle';
    listeningRollupRef.current = '';
    setLiveTranscript('');
  }, []);

  useEffect(() => {
    return () => {
      if (webSpeechSessionRef.current) {
        void webSpeechSessionRef.current.stop();
        webSpeechSessionRef.current = null;
      }
      if (NATIVE_CONTINUOUS) {
        stopNativeListening();
      }
    };
  }, [stopNativeListening]);

  const processSegment = useCallback(
    async (rawTranscript: string) => {
      const trimmed = rawTranscript.trim();
      if (!trimmed) return;

      setSegmentBusy(true);
      try {
        if (isRetractionCommand(trimmed)) {
          const r = await retractLastVoiceEntry(db, template.id);
          setErrorMsg(null);
          if (r.ok) {
            setSavedCount(c => Math.max(0, c - 1));
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            void speakText(r.message).catch(() => {});
          } else {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void speakText(r.message).catch(() => {});
          }
          return;
        }

        const backendOk = await fetchHealth();
        const result = backendOk
          ? await parseTranscript(trimmed, template)
          : parseTranscriptHeuristic(trimmed, template);

        if (!result) {
          setErrorMsg('Could not parse — try again');
          return;
        }

        if (result.invalid) {
          setErrorMsg("Didn't sound like a data entry — try again");
          void speakText(buildReprompt(template)).catch(() => {});
          return;
        }

        setErrorMsg(null);
        const record: ClipRecord = {
          id: randomUuid(),
          templateId: result.record.templateId,
          templateName: result.record.templateName,
          payload: result.record.payload,
          rawTranscript: result.record.rawTranscript,
          confidenceScore: result.confidence,
          validated: false,
          synced: false,
          capturedAt: new Date().toISOString(),
        };
        record.validated = validateRecord(record).valid;
        await insertCapture(db, record, 'voice_capture', null);
        await trySyncCaptures(db);
        setSavedCount(c => c + 1);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSaved?.(record);
        await speakSavedCaptureFeedback(db, template, record.payload, result.record.rawTranscript, {
          excludeCaptureId: record.id,
        });
      } catch (e) {
        setErrorMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSegmentBusy(false);
      }
    },
    [db, onSaved, parseTranscript, template],
  );

  const enqueueSegment = useCallback(
    (text: string): boolean => {
      const t = text.trim();
      if (!t) return false;
      const now = Date.now();
      if (!isRetractionCommand(t) && t === dedupeRef.current.text && now - dedupeRef.current.at < 1200) {
        return false;
      }
      if (!isRetractionCommand(t)) {
        dedupeRef.current = { text: t, at: now };
      }

      queueRef.current.push(t);
      if (drainLockRef.current) return true;
      drainLockRef.current = true;
      void (async () => {
        while (queueRef.current.length > 0) {
          const next = queueRef.current.shift()!;
          await processSegment(next);
        }
        drainLockRef.current = false;
      })();
      return true;
    },
    [processSegment],
  );

  useSpeechRecognitionEvent('result', ev => {
    if (captureStateRef.current !== 'listening') return;
    const { displayText, segmentForEnqueue, isFinal } = pieceFromNativeSpeechResultEvent(
      unwrapNativeSpeechPayload(ev),
    );
    const rollup = listeningRollupRef.current;
    const hyp = displayText.trim();

    if (isFinal) {
      const seg = (segmentForEnqueue || displayText).trim();
      if (seg) {
        const queued = enqueueSegment(seg);
        if (queued && !isRetractionCommand(seg)) {
          listeningRollupRef.current = [rollup, seg].filter(Boolean).join(' ').trim();
        }
      }
      setLiveTranscript(listeningRollupRef.current);
      return;
    }

    const live = hyp ? [rollup, hyp].filter(Boolean).join(' ').trim() : rollup;
    setLiveTranscript(live);
  });

  useSpeechRecognitionEvent('error', ev => {
    if (captureStateRef.current !== 'listening') return;
    if (typeof ev !== 'object' || ev === null) return;
    const e = ev as { error?: string; message?: string };
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    setErrorMsg(e.message || e.error || 'Speech recognition error');
  });

  const processTranscriptAfterStop = useCallback(
    async (rawTranscript: string) => {
      const tr = rawTranscript.trim();
      if (!tr) {
        setErrorMsg('Could not parse — try again');
        setCaptureState('idle');
        setLiveTranscript('');
        return;
      }
      setLiveTranscript(tr);
      try {
        if (isRetractionCommand(tr)) {
          const r = await retractLastVoiceEntry(db, template.id);
          setErrorMsg(r.ok ? null : r.message);
          if (r.ok) {
            setSavedCount(c => Math.max(0, c - 1));
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            void speakText(r.message).catch(() => {});
          } else {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void speakText(r.message).catch(() => {});
          }
          setCaptureState('idle');
          setLiveTranscript('');
          return;
        }
        const backendOk = await fetchHealth();
        const result = backendOk
          ? await parseTranscript(tr, template)
          : parseTranscriptHeuristic(tr, template);
        if (!result) {
          setErrorMsg('Could not parse — try again');
          setCaptureState('idle');
          setLiveTranscript('');
          return;
        }

        if (result.invalid) {
          setCaptureState('idle');
          setErrorMsg("Didn't sound like a data entry — try again");
          setLiveTranscript('');
          void speakText(buildReprompt(template)).catch(() => {});
          return;
        }

        setCaptureState('saving');
        const record: ClipRecord = {
          id: randomUuid(),
          templateId: result.record.templateId,
          templateName: result.record.templateName,
          payload: result.record.payload,
          rawTranscript: result.record.rawTranscript || tr,
          confidenceScore: result.confidence,
          validated: false,
          synced: false,
          capturedAt: new Date().toISOString(),
        };
        record.validated = validateRecord(record).valid;
        await insertCapture(db, record, 'voice_capture', null);
        await trySyncCaptures(db);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCaptureState('idle');
        setLiveTranscript('');
        onSaved?.(record);
        await speakSavedCaptureFeedback(db, template, record.payload, record.rawTranscript, {
          excludeCaptureId: record.id,
        });
      } catch (e) {
        setErrorMsg(`Capture failed: ${e instanceof Error ? e.message : String(e)}`);
        setCaptureState('idle');
        setLiveTranscript('');
      }
    },
    [db, onSaved, parseTranscript, template],
  );

  const startNativeContinuous = useCallback(async () => {
    const mod = getExpoSpeechRecognitionModule();
    if (!mod) {
      setErrorMsg(
        'On-device speech is not in this build. Run: npx expo run:ios (or android) after adding expo-speech-recognition.',
      );
      return;
    }
    const perm = await mod.requestPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg('Speech recognition permission denied — enable it in Settings');
      return;
    }
    if (!mod.isRecognitionAvailable()) {
      setErrorMsg('Speech recognition is not available on this device');
      return;
    }
    const net = await NetInfo.fetch();
    setErrorMsg(null);
    setLiveTranscript('');
    listeningRollupRef.current = '';
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCaptureState('listening');
    // Native can emit `result` before React re-renders; keep ref in sync so we don't drop interim text.
    captureStateRef.current = 'listening';
    mod.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      // iOS on-device often yields few/no partials; use network recognition when online (same as Android).
      requiresOnDeviceRecognition: !net.isConnected,
    });
  }, []);

  const handlePress = useCallback(async () => {
    setErrorMsg(null);

    if (NATIVE_CONTINUOUS) {
      if (captureState === 'idle') {
        const mic = await requestMicPermission();
        if (!mic) {
          setErrorMsg('Microphone permission denied — enable it in Settings');
          return;
        }
        await startNativeContinuous();
        return;
      }
      if (captureState === 'listening') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        stopNativeListening();
        setCaptureState('idle');
      }
      return;
    }

    // Web (and any fallback): tap-to-stop capture. On web, prefer Web Speech API for live captions.
    if (captureState === 'idle') {
      const granted = await requestMicPermission();
      if (!granted) {
        setErrorMsg('Microphone permission denied — enable it in Settings');
        return;
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (Platform.OS === 'web' && isWebSpeechRecognitionSupported()) {
        setLiveTranscript('');
        const session = createWebSpeechLiveSession(t => setLiveTranscript(t), 'en-US');
        webSpeechSessionRef.current = session;
        setCaptureState('recording');
        session.start();
        return;
      }

      setCaptureState('recording');
      try {
        const rec = await startRecording();
        setActiveRecording(rec);
      } catch {
        setErrorMsg('Microphone unavailable');
        setCaptureState('idle');
      }
      return;
    }

    if (captureState === 'recording') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCaptureState('parsing');

      if (webSpeechSessionRef.current) {
        const session = webSpeechSessionRef.current;
        webSpeechSessionRef.current = null;
        try {
          const tr = await session.stop();
          await processTranscriptAfterStop(tr);
        } catch (e) {
          setErrorMsg(`Capture failed: ${e instanceof Error ? e.message : String(e)}`);
          setCaptureState('idle');
          setLiveTranscript('');
        }
        return;
      }

      if (!activeRecording) {
        setCaptureState('idle');
        return;
      }

      try {
        const uri = await stopRecording(activeRecording);
        setActiveRecording(null);
        const isIos = Platform.OS === 'ios';
        const { transcript } = await transcribeWithFallback(
          uri,
          isIos ? 'capture.wav' : 'capture.m4a',
          isIos ? 'audio/wav' : 'audio/mp4',
        );
        await processTranscriptAfterStop(transcript);
      } catch (e) {
        setErrorMsg(`Capture failed: ${e instanceof Error ? e.message : String(e)}`);
        setCaptureState('idle');
        setLiveTranscript('');
      }
    }
  }, [
    captureState,
    activeRecording,
    processTranscriptAfterStop,
    startNativeContinuous,
    stopNativeListening,
  ]);

  const handleManualSync = useCallback(async () => {
    setSyncMsg(null);
    setErrorMsg(null);
    setSyncingNow(true);
    try {
      const result = await flushPendingCaptures(db, 40);
      if (result.pushed > 0) {
        setSyncMsg(`Synced ${result.pushed} capture${result.pushed === 1 ? '' : 's'} to Supabase`);
      } else {
        setSyncMsg('No rows synced yet. Check network and Supabase table setup.');
      }
    } catch (e) {
      setErrorMsg(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncingNow(false);
    }
  }, [db]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.statusText}>Connecting to backend…</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.center}>
        <Text style={styles.statusText}>Backend not available</Text>
        {backendError ? <Text style={styles.error}>{backendError}</Text> : null}
      </View>
    );
  }

  const isRecording = captureState === 'recording';
  const isListening = NATIVE_CONTINUOUS && captureState === 'listening';
  const isBusy =
    captureState === 'parsing' || captureState === 'saving' || (NATIVE_CONTINUOUS && segmentBusy);
  const disableSyncButton = isBusy || isRecording || isListening || syncingNow;

  const label = NATIVE_CONTINUOUS
    ? isListening
      ? segmentBusy
        ? 'Saving last phrase… keep talking for more'
        : 'Listening — speak each entry; tap mic to stop'
      : 'Tap mic to start continuous capture'
    : captureState === 'saving'
      ? 'Saving…'
      : captureState === 'parsing'
        ? 'Parsing & saving…'
        : isRecording
          ? Platform.OS === 'web' && isWebSpeechRecognitionSupported()
            ? 'Listening — tap to stop when done'
            : 'Recording — tap to stop'
          : 'Tap to record';

  const showLiveSttPanel =
    savedCount > 0 ||
    liveTranscript.length > 0 ||
    (NATIVE_CONTINUOUS && isListening) ||
    (Platform.OS === 'web' && isRecording && isWebSpeechRecognitionSupported()) ||
    (captureState === 'parsing' && liveTranscript.length > 0);

  const showLivePlaceholder =
    (NATIVE_CONTINUOUS && isListening && liveTranscript.length === 0 && !segmentBusy) ||
    (Platform.OS === 'web' &&
      isRecording &&
      isWebSpeechRecognitionSupported() &&
      liveTranscript.length === 0);

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, (isRecording || isListening) && styles.buttonRecording]}
        onPress={handlePress}
        disabled={isBusy && !isListening}
      >
        {isBusy && !isListening ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : isRecording || isListening ? (
          <View style={styles.dotRecording} />
        ) : (
          <Images.MicIcon width={32} height={40} />
        )}
      </Pressable>

      <Text style={styles.label}>{label}</Text>

      {showLiveSttPanel ? (
        <View style={styles.liveBox}>
          {savedCount > 0 ? (
            <Text style={styles.savedCount}>{savedCount} saved this session</Text>
          ) : null}
          {liveTranscript.length > 0 ? (
            <Text style={styles.liveText} selectable>
              {liveTranscript}
            </Text>
          ) : showLivePlaceholder ? (
            <Text style={styles.livePlaceholder}>Speak now — text appears as you talk.</Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        style={[styles.syncButton, disableSyncButton && styles.syncButtonDisabled]}
        onPress={handleManualSync}
        disabled={disableSyncButton}
      >
        {syncingNow ? (
          <ActivityIndicator color="#111" size="small" />
        ) : (
          <Text style={styles.syncButtonText}>Sync now</Text>
        )}
      </Pressable>

      {syncMsg ? <Text style={styles.syncText}>{syncMsg}</Text> : null}
      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  button: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRecording: {
    backgroundColor: '#E53935',
  },
  dotRecording: {
    width: 16,
    height: 16,
    borderRadius: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: '#555',
    letterSpacing: 0.2,
    textAlign: 'center',
    maxWidth: 300,
  },
  statusText: {
    fontSize: 14,
    color: '#888',
  },
  liveBox: {
    maxWidth: 300,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
  },
  savedCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 4,
  },
  liveText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  livePlaceholder: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#888',
    lineHeight: 18,
  },
  syncButton: {
    minWidth: 132,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFCFCF',
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  syncText: {
    fontSize: 12,
    color: '#2E7D32',
    textAlign: 'center',
    maxWidth: 280,
  },
  error: {
    fontSize: 13,
    color: '#E53935',
    textAlign: 'center',
    maxWidth: 280,
  },
});
