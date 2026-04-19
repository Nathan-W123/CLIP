import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../src/components/ui/colors';
import { Type } from '../../src/components/ui/typography';
import { NoteSection } from '../../src/components/ui';
import {
  appendTranscriptionNote,
  findMockProjectById,
  findProjectContent,
  recordMockCapture,
} from '../../src/components/mock';
import { Images } from '../../src/assets/images';
import type { ChecklistStep, MockProject, ProjectSection } from '../../src/components/mock';
import { transcribeAudioFile } from '../../src/services/transcribe';
import { insertCapture } from '../../src/db/capturesRepository';
import { trySyncCaptures } from '../../src/services/syncCaptures';
import { applyMasterEnrichmentIfNeeded } from '../../src/core/enrichMasterPayload';
import { coerceFieldValues } from '../../src/core/masterSchemas';
import {
  resolveMasterTableForProject,
  resolveRecordTemplateAsync,
} from '../../src/core/recordTemplate';
import { VoiceParserProvider } from '../../src/voice/VoiceParserProvider';
import { useVoiceParser } from '../../src/voice/useVoiceParser';
import { validateRecord } from '../../src/core/validation';
import { fallbackPayload } from '../../src/core/payloadValidation';
import type { ClipRecord } from '../../src/core/schemas';
import type { DatabaseEntryPayload, ParsedPayload } from '../../src/core/payloadValidation';
import { randomUuid } from '../../src/utils/randomUuid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CapturedNote {
  id: string;
  templateName: string;
  payload: Record<string, string | number | boolean>;
  rawTranscript: string;
  confidenceScore: number;
  capturedAt: string;
}

type CaptureState = 'idle' | 'recording' | 'parsing';

/** Same defaults as `app/record.tsx` — WAV on iOS, AAC on Android. */
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

function clipRecordToCapturedNote(r: ClipRecord): CapturedNote {
  const raw = r.payload as ParsedPayload | Record<string, unknown> | undefined;
  let payload: Record<string, string | number | boolean> = {};
  const maybeDb = raw as { kind?: string; fields?: Record<string, string | number | boolean | null> };
  if (maybeDb?.kind === 'database_entry' && maybeDb.fields) {
    for (const [k, v] of Object.entries(maybeDb.fields)) {
      if (v === null || v === undefined) continue;
      payload[k] = v as string | number | boolean;
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        payload[k] = v;
      }
    }
  }
  return {
    id: r.id,
    templateName: r.templateName,
    payload,
    rawTranscript: r.rawTranscript,
    confidenceScore: r.confidenceScore,
    capturedAt: r.capturedAt,
  };
}

// ─── Star badge ───────────────────────────────────────────────────────────────

function StarBadge({ color }: { color: string }) {
  const size = 34;
  const starSize = Math.round(size * 0.52);
  return (
    <View
      style={[
        styles.starBadge,
        { backgroundColor: color, borderRadius: Math.round(size * 0.22) },
      ]}
    >
      <Images.ProjectStarIcon width={starSize} height={starSize + 1} />
    </View>
  );
}

// ─── Step block ───────────────────────────────────────────────────────────────

function StepBlock({ step }: { step: ChecklistStep }) {
  const header = `${step.order}. ${step.title} · Completed · ${step.completedAt ?? ''}`;
  return (
    <View style={styles.stepBlock}>
      <Text style={styles.stepHeader}>{header}</Text>
      {step.body ? <Text style={styles.stepBody}>{step.body}</Text> : null}
      {step.entries && step.entries.length > 0 ? (
        <View style={styles.entriesBlock}>
          {step.entries.map((entry, i) => (
            <Text key={i} style={styles.entryLine}>
              {entry.value ? `${entry.key}: ${entry.value}` : `${entry.key}:`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function EmptyProjectNotes({ project }: { project: MockProject }) {
  const section: ProjectSection = {
    id: 'captures',
    title: 'Captures',
    blocks: [
      {
        type: 'text',
        body:
          project.recentActivity && project.recentActivity.length > 0
            ? project.recentActivity.map(entry => entry.label).join('\n')
            : 'No captures yet.',
      },
    ],
  };
  return <NoteSection section={section} />;
}

// ─── Captured note card (swipe left to delete) ────────────────────────────────

const DELETE_THRESHOLD = 80;

function NoteCard({ note, onDelete }: { note: CapturedNote; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -DELETE_THRESHOLD) {
          Animated.timing(translateX, { toValue: -300, duration: 200, useNativeDriver: true }).start(onDelete);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const deleteOpacity = translateX.interpolate({ inputRange: [-DELETE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={{ overflow: 'hidden', borderRadius: 12 }}>
      <Animated.View style={[styles.deleteAction, { opacity: deleteOpacity }]}>
        <Text style={styles.deleteLabel}>Delete</Text>
      </Animated.View>
      <Animated.View style={[styles.noteCard, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <View style={styles.noteCardHeader}>
          <Text style={styles.noteTemplateName}>{note.templateName}</Text>
          <Text style={styles.noteTime}>
            {new Date(note.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.noteTranscript}>{note.rawTranscript}</Text>
        {Object.entries(note.payload).map(([k, v]) => (
          <Text key={k} style={styles.noteField}>
            {k}: {String(v)}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function ProjectDetailScreenInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { parseTranscript } = useVoiceParser();

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [capturedNotes, setCapturedNotes] = useState<CapturedNote[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    return () => {
      void recordingRef.current?.stopAndUnloadAsync();
    };
  }, []);

  useEffect(() => {
    if (captureState === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [captureState]);

  const project = id ? findMockProjectById(id) : undefined;

  if (!project) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Project not found</Text>
        </View>
      </SafeAreaView>
    );
  }

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
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { recording } = await Audio.Recording.createAsync(recordingOptions());
    recordingRef.current = recording;
    setCaptureState('recording');
  }

  async function stopRecordingAndTranscribe() {
    if (!project) {
      setCaptureState('idle');
      return;
    }
    const p = project;

    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) {
      setCaptureState('idle');
      return;
    }

    setCaptureState('parsing');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) {
        throw new Error('No recording file.');
      }

      const isIosWav = Platform.OS === 'ios';
      const filename = isIosWav ? 'capture.wav' : 'capture.m4a';
      const mime = isIosWav ? 'audio/wav' : 'audio/mp4';

      const { transcript } = await transcribeAudioFile(uri, filename, mime);
      const transcriptText = transcript.trim() || '(No speech detected)';

      if (!transcriptText || transcriptText.startsWith('(')) {
        setCaptureState('idle');
        return;
      }

      const tmpl = await resolveRecordTemplateAsync(db, p);
      if (!tmpl) {
        setErrorMessage('No template for this project.');
        setCaptureState('idle');
        return;
      }

      const pr = await parseTranscript(transcriptText, tmpl);
      let payload: ParsedPayload =
        (pr?.record.payload as ParsedPayload | undefined) ??
        fallbackPayload(tmpl, transcriptText);
      payload = applyMasterEnrichmentIfNeeded(tmpl, transcriptText, payload);
      const masterTable = resolveMasterTableForProject(p);
      if (masterTable && payload && typeof payload === 'object') {
        const maybe = payload as {
          kind?: string;
          fields?: Record<string, string | number | boolean | null>;
        };
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
      await insertCapture(db, record, 'project_screen', p.id);
      await trySyncCaptures(db);
      appendTranscriptionNote(p.id, transcriptText);
      const firstLine =
        transcriptText.split('\n').find(l => l.trim())?.trim() ?? transcriptText.slice(0, 80);
      recordMockCapture(p.id, firstLine);
      setCapturedNotes(prev => [clipRecordToCapturedNote(record), ...prev]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCaptureState('idle');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMessage(msg);
      setCaptureState('idle');
    }
  }

  async function handleCapturePress() {
    if (captureState === 'parsing') return;
    if (captureState === 'idle') {
      await startRecording();
    } else if (captureState === 'recording') {
      await stopRecordingAndTranscribe();
    }
  }

  function deleteNote(noteId: string) {
    setCapturedNotes((prev: CapturedNote[]) => prev.filter((n: CapturedNote) => n.id !== noteId));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const typeLabel =
    project.type === 'checklist'
      ? 'Checklist Project'
      : project.type === 'data_collection'
      ? 'Data Collection Project'
      : 'Notes Project';

  const completedSteps = (project.steps ?? [])
    .filter(s => s.status === 'completed')
    .sort((a, b) => b.order - a.order);

  const pageContent =
    completedSteps.length === 0 ? findProjectContent(project.id) : null;

  const captureBtnBg =
    captureState === 'recording' ? '#E53E3E'
    : captureState === 'parsing'  ? Colors.textTertiary
    : Colors.orange;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topIcon}>
          <Images.ProjectStarIcon width={30} height={32} />
        </View>

        <Pressable
          style={({ pressed }: { pressed: boolean }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Images.BackIcon width={22} height={18} />
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={styles.title}>{project.title}</Text>
          <StarBadge color={
            project.type === 'data_collection' ? Colors.orange
            : project.isCompleted ? Colors.orangeDeep
            : Colors.orangeDark
          } />
        </View>
        <Text style={styles.typeLabel}>{typeLabel}</Text>

        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}

        {capturedNotes.length > 0 && (
          <View style={styles.capturedSection}>
            {capturedNotes.map((note: CapturedNote) => (
              <NoteCard key={note.id} note={note} onDelete={() => deleteNote(note.id)} />
            ))}
            <View style={styles.capturedDivider} />
          </View>
        )}

        {completedSteps.length > 0 ? (
          <View style={styles.stepsContainer}>
            {completedSteps.map((step, i) => (
              <View key={step.id}>
                {i > 0 ? <View style={styles.stepDivider} /> : null}
                <StepBlock step={step} />
              </View>
            ))}
          </View>
        ) : pageContent ? (
          <View style={styles.sectionsContainer}>
            {pageContent.sections.map(section => (
              <NoteSection key={section.id} section={section} />
            ))}
          </View>
        ) : (
          <View style={styles.sectionsContainer}>
            <EmptyProjectNotes project={project} />
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={styles.captureBar}>
        <Pressable
          style={[styles.captureBtn, { backgroundColor: captureBtnBg }]}
          onPress={handleCapturePress}
          disabled={captureState === 'parsing'}
        >
          {captureState === 'parsing' ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Animated.View style={{ opacity: captureState === 'recording' ? pulseAnim : 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Images.MicIcon width={18} height={22} />
              <Text style={styles.captureLabel}>
                {captureState === 'recording' ? 'Stop' : 'Capture'}
              </Text>
            </Animated.View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function ProjectDetailScreen() {
  return (
    <VoiceParserProvider>
      <ProjectDetailScreenInner />
    </VoiceParserProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.backgroundScreen,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  topIcon: {
    marginTop: 12,
    marginBottom: 16,
  },
  backBtn: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  backBtnPressed: {
    opacity: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  starBadge: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: {
    ...Type.subhead,
    color: Colors.textTertiary,
    marginBottom: 28,
  },
  errorText: {
    ...Type.subhead,
    color: '#C62828',
    marginBottom: 16,
    marginTop: -12,
  },

  // Captured notes
  capturedSection: {
    marginBottom: 8,
    gap: 10,
  },
  capturedDivider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginTop: 8,
    marginBottom: 20,
  },
  noteCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  noteCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  noteTemplateName: {
    ...Type.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  noteTime: {
    ...Type.caption,
    color: Colors.textTertiary,
  },
  noteTranscript: {
    ...Type.body,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  noteField: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  deleteAction: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: DELETE_THRESHOLD,
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  deleteLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },

  // Step blocks
  stepsContainer: { gap: 0 },
  stepDivider: { height: 32 },
  stepBlock: { gap: 10 },
  stepHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  stepBody: {
    ...Type.body,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  entriesBlock: { gap: 3, marginTop: 2 },
  entryLine: {
    ...Type.body,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  sectionsContainer: { gap: 0 },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    ...Type.body,
    color: Colors.textTertiary,
  },

  // Capture bar
  bottomSpacer: { height: 20 },
  captureBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 36,
    paddingTop: 12,
    backgroundColor: Colors.backgroundScreen,
  },
  captureBtn: {
    height: 54,
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    minWidth: 160,
  },
  captureLabel: {
    ...Type.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 17,
  },
});