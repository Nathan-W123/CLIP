import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Colors } from '../src/components/ui/colors';
import { Type } from '../src/components/ui/typography';
import {
  findProjectById,
  MOCK_PROJECTS,
  recordMockCapture,
  appendTranscriptionNote,
} from '../src/components/mock';
import { fetchHealth } from '../src/services/transcribe';
import { transcribeWithFallback } from '../src/voice/transcribeWithFallback';
import { parseTranscriptHeuristic } from '../src/voice/offlineParse';
import { Images } from '../src/assets/images';
import { insertCapture } from '../src/db/capturesRepository';
import { trySyncCaptures } from '../src/services/syncCaptures';
import { speakSavedCaptureFeedback } from '../src/services/postCaptureSpeech';
import { applyMasterEnrichmentIfNeeded } from '../src/core/enrichMasterPayload';
import { coerceFieldValues } from '../src/core/masterSchemas';
import {
  resolveMasterTableForProject,
  resolveRecordTemplateAsync,
} from '../src/core/recordTemplate';
import { VoiceParserProvider } from '../src/voice/VoiceParserProvider';
import { useVoiceParser } from '../src/voice/useVoiceParser';
import { validateRecord } from '../src/core/validation';
import { fallbackPayload } from '../src/core/payloadValidation';
import type { ClipRecord } from '../src/core/schemas';
import type { DatabaseEntryPayload, ParsedPayload } from '../src/core/payloadValidation';
import { randomUuid } from '../src/utils/randomUuid';

type CaptureState = 'idle' | 'listening' | 'processing';

const MIC_SIZE = 80;

/** iOS: linear PCM WAV @ 16 kHz (backend-native). Android: AAC m4a → server ffmpeg if installed. */
function recordingOptions(): Audio.RecordingOptions {
  return {
    isMeteringEnabled: true,
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: '.wav',
      outputFormat: Audio.IOSOutputFormat.LINEARPCM,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  };
}

function RecordScreenInner() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const db = useSQLiteContext();
  const { parseTranscript } = useVoiceParser();

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const project = projectId ? findProjectById(MOCK_PROJECTS, projectId) : null;

  useEffect(() => {
    return () => {
      void recordingRef.current?.stopAndUnloadAsync();
    };
  }, []);

  useEffect(() => {
    if (captureState !== 'listening') {
      pulseAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.45,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [captureState, pulseAnim]);

  async function startRecording() {
    setErrorMessage(null);
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      setErrorMessage('Microphone permission is required to capture.');
      return;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(recordingOptions());
    recordingRef.current = recording;
    setCaptureState('listening');
  }

  async function stopRecordingAndTranscribe() {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) {
      setCaptureState('idle');
      return;
    }

    setCaptureState('processing');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) {
        throw new Error('No recording file.');
      }

      const isIosWav = Platform.OS === 'ios';
      const filename = isIosWav ? 'capture.wav' : 'capture.m4a';
      const mime = isIosWav ? 'audio/wav' : 'audio/mp4';

      const { transcript } = await transcribeWithFallback(uri, filename, mime);
      const transcriptText = transcript.trim() || '(No speech detected)';

      if (!projectId || !transcriptText || transcriptText.startsWith('(')) {
        router.back();
        return;
      }
      if (!project) {
        setErrorMessage('Project not found.');
        setCaptureState('idle');
        return;
      }
      const tmpl = await resolveRecordTemplateAsync(db, project);
      if (!tmpl) {
        setErrorMessage('No template for this project.');
        setCaptureState('idle');
        return;
      }

      const backendOk = await fetchHealth();
      const pr = backendOk
        ? await parseTranscript(transcriptText, tmpl)
        : parseTranscriptHeuristic(transcriptText, tmpl);
      let payload: ParsedPayload =
        (pr?.record.payload as ParsedPayload | undefined) ??
        fallbackPayload(tmpl, transcriptText);
      payload = applyMasterEnrichmentIfNeeded(tmpl, transcriptText, payload);
      const masterTable = resolveMasterTableForProject(project);
      if (masterTable && payload && typeof payload === 'object') {
        const maybe = payload as { kind?: string; fields?: Record<string, string | number | boolean | null> };
        if (maybe.kind === 'database_entry' && maybe.fields) {
          maybe.fields = coerceFieldValues(masterTable, maybe.fields);
          payload = maybe as DatabaseEntryPayload;
        }
      }

      const record: ClipRecord = {
        id: randomUuid(),
        templateId: tmpl.id,
        templateName: tmpl.name,
        payload,
        rawTranscript: transcriptText,
        confidenceScore: pr?.confidence ?? 0.45,
        validated: false,
        synced: false,
        capturedAt: new Date().toISOString(),
        masterTable,
      };
      record.validated = validateRecord(record).valid;
      await insertCapture(db, record, 'record_screen', projectId);
      await trySyncCaptures(db);
      await speakSavedCaptureFeedback(db, tmpl, record.payload, transcriptText, {
        excludeCaptureId: record.id,
      });
      appendTranscriptionNote(projectId, transcriptText);
      const firstLine =
        transcriptText.split('\n').find(l => l.trim())?.trim() ?? transcriptText.slice(0, 80);
      recordMockCapture(projectId, firstLine);
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMessage(msg);
      setCaptureState('idle');
    }
  }

  async function handleMicPress() {
    if (captureState === 'idle') {
      await startRecording();
    } else if (captureState === 'listening') {
      await stopRecordingAndTranscribe();
    }
  }

  const screenLabelText =
    captureState === 'idle'
      ? 'Capture'
      : captureState === 'listening'
        ? 'Listening…'
        : 'Saving…';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }: { pressed: boolean }) =>
            pressed ? styles.pressed : undefined
          }
        >
          <Images.BackIcon width={22} height={18} />
        </Pressable>
        <Image source={Images.clipLogo} style={{ width: 26, height: 28 }} resizeMode="contain" />
      </View>

      {project ? (
        <Text style={styles.projectTitle}>{project.title}</Text>
      ) : null}
      <Text style={styles.screenLabel}>{screenLabelText}</Text>

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <View style={styles.captureCenter}>
        {captureState === 'listening' ? (
          <Animated.View
            style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
          />
        ) : null}
        {captureState === 'processing' ? (
          <ActivityIndicator size="large" color={Colors.orange} />
        ) : (
          <Pressable
            style={({ pressed }: { pressed: boolean }) => [
              styles.micBtn,
              captureState === 'listening' && styles.micBtnListening,
              pressed && styles.micBtnPressed,
            ]}
            onPress={handleMicPress}
          >
            <Images.MicIcon width={28} height={35} />
          </Pressable>
        )}
        <Text style={styles.captureHint}>
          {captureState === 'idle'
            ? 'Tap to capture'
            : captureState === 'listening'
              ? 'Tap to stop'
              : 'Transcribing & saving…'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default function RecordScreen() {
  return (
    <VoiceParserProvider>
      <RecordScreenInner />
    </VoiceParserProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.backgroundScreen,
  },
  pressed: {
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 8,
  },
  projectTitle: {
    ...Type.headline,
    color: Colors.textTertiary,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  screenLabel: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  errorText: {
    ...Type.subhead,
    color: '#C62828',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  captureCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingHorizontal: 24,
  },
  pulseRing: {
    position: 'absolute',
    width: MIC_SIZE + 48,
    height: MIC_SIZE + 48,
    borderRadius: (MIC_SIZE + 48) / 2,
    backgroundColor: Colors.orangeLight,
    opacity: 0.35,
  },
  micBtn: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnListening: {
    backgroundColor: Colors.orangeDeep,
  },
  micBtnPressed: {
    backgroundColor: Colors.orangeDark,
  },
  captureHint: {
    ...Type.subhead,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
