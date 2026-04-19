// Push-to-activate voice capture component.
// Press once → recording. Press again → stops, parses, shows ParsedPreview.
// On confirm: validates + writes to SQLite → sync queue queued.

import React, { useState, useCallback } from 'react';
import { View, Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useVoiceParser } from '../voice/useVoiceParser';
import { startRecording, stopRecording, requestMicPermission, type ActiveRecording } from '../voice/audio';
import { insertRecord } from '../core/sqlite.expo';
import { validateRecord } from '../core/validation';
import { ParsedPreview } from './ParsedPreview';
import { Images } from '../../app/images/assets';
import type { Template, ClipRecord } from '../core/schemas';
import type { ParseResult } from '../voice/cactus';

interface Props {
  template: Template;
  onSaved?: (record: ClipRecord) => void;
}

type CaptureState = 'idle' | 'recording' | 'parsing' | 'review' | 'saving';

export function VoiceCapture({ template, onSaved }: Props) {
  const { isReady, isLoading, downloadProgress, parseVoice, error: modelError } = useVoiceParser();
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [activeRecording, setActiveRecording] = useState<ActiveRecording | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      } catch (e) {
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
        setParseResult(result);
        setCaptureState('review');
      } catch (e) {
        setErrorMsg(`Parse failed: ${e instanceof Error ? e.message : String(e)}`);
        setCaptureState('idle');
      }
    }
  }, [captureState, activeRecording, parseVoice, template]);

  const handleConfirm = useCallback(async () => {
    if (!parseResult) return;
    setCaptureState('saving');

    const record: ClipRecord = {
      id: crypto.randomUUID(),
      templateId: parseResult.record.templateId,
      templateName: parseResult.record.templateName,
      payload: parseResult.record.payload,
      rawTranscript: parseResult.record.rawTranscript,
      confidenceScore: parseResult.confidence,
      validated: false,
      synced: false,
      capturedAt: new Date().toISOString(),
    };

    const validation = validateRecord(record);
    record.validated = validation.valid;

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    insertRecord(record);
    setParseResult(null);
    setCaptureState('idle');
    onSaved?.(record);
  }, [parseResult, onSaved]);

  const handleDiscard = useCallback(() => {
    setParseResult(null);
    setCaptureState('idle');
  }, []);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.statusText}>
          Loading AI models… {Math.round(downloadProgress * 100)}%
        </Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.center}>
        <Text style={styles.statusText}>AI models not ready</Text>
        {modelError ? <Text style={styles.error}>{modelError}</Text> : null}
      </View>
    );
  }

  if (captureState === 'review' && parseResult) {
    return (
      <ParsedPreview
        result={parseResult}
        template={template}
        onConfirm={handleConfirm}
        onDiscard={handleDiscard}
      />
    );
  }

  const isRecording = captureState === 'recording';
  const isParsing = captureState === 'parsing';

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, isRecording && styles.buttonRecording]}
        onPress={handlePress}
        disabled={isParsing || captureState === 'saving'}
      >
        {isParsing ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : isRecording ? (
          <View style={styles.dotRecording} />
        ) : (
          <Images.MicIcon width={32} height={40} />
        )}
      </Pressable>

      <Text style={styles.label}>
        {isParsing ? 'Parsing…' : isRecording ? 'Recording — tap to stop' : 'Tap to record'}
      </Text>

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
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
  error: {
    fontSize: 13,
    color: '#E53935',
  },
});
