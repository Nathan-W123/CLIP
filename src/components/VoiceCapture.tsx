// Push-to-activate voice capture. Stop → STT + parse → SQLite + Supabase.
// Speaks back a short confirmation via Piper TTS after a successful save.

import React, { useState, useCallback } from 'react';
import { View, Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useVoiceParser } from '../voice/useVoiceParser';
import { startRecording, stopRecording, requestMicPermission, type ActiveRecording } from '../voice/audio';
import { insertCapture } from '../db/capturesRepository';
import { flushPendingCaptures, trySyncCaptures } from '../services/syncCaptures';
import { speakText } from '../services/tts';
import { validateRecord } from '../core/validation';
import { Images } from '../assets/images';
import type { Template, ClipRecord } from '../core/schemas';
import { randomUuid } from '../utils/randomUuid';

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

interface Props {
  template: Template;
  onSaved?: (record: ClipRecord) => void;
}

type CaptureState = 'idle' | 'recording' | 'parsing' | 'saving';

export function VoiceCapture({ template, onSaved }: Props) {
  const db = useSQLiteContext();
  const { isReady, isLoading, parseVoice, error: backendError } = useVoiceParser();
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [activeRecording, setActiveRecording] = useState<ActiveRecording | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    setErrorMsg(null);

    if (captureState === 'idle') {
      const granted = await requestMicPermission();
      if (!granted) {
        setErrorMsg('Microphone permission denied — enable it in Settings');
        return;
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

    if (captureState === 'recording' && activeRecording) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCaptureState('parsing');
      try {
        const uri = await stopRecording(activeRecording);
        setActiveRecording(null);
        const result = await parseVoice(uri, template);
        if (!result) {
          setErrorMsg('Could not parse — try again');
          setCaptureState('idle');
          return;
        }

        if (result.invalid) {
          setCaptureState('idle');
          setErrorMsg("Didn't sound like a data entry — try again");
          void speakText(buildReprompt(template)).catch(() => {});
          return;
        }

        setCaptureState('saving');
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
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCaptureState('idle');
        onSaved?.(record);
        // Speak back a short confirmation of the raw transcript via Piper TTS
        void speakText(result.record.rawTranscript.slice(0, 120)).catch(() => {});
      } catch (e) {
        setErrorMsg(`Capture failed: ${e instanceof Error ? e.message : String(e)}`);
        setCaptureState('idle');
      }
    }
  }, [captureState, activeRecording, db, onSaved, parseVoice, template]);

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
  const isBusy = captureState === 'parsing' || captureState === 'saving';
  const disableSyncButton = isBusy || isRecording || syncingNow;

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, isRecording && styles.buttonRecording]}
        onPress={handlePress}
        disabled={isBusy}
      >
        {isBusy ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : isRecording ? (
          <View style={styles.dotRecording} />
        ) : (
          <Images.MicIcon width={32} height={40} />
        )}
      </Pressable>

      <Text style={styles.label}>
        {captureState === 'saving'
          ? 'Saving…'
          : captureState === 'parsing'
            ? 'Transcribing & parsing…'
            : isRecording
              ? 'Recording — tap to stop'
              : 'Tap to record'}
      </Text>

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
  },
  statusText: {
    fontSize: 14,
    color: '#888',
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
