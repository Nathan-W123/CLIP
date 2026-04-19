<<<<<<< Updated upstream
import React, { useCallback, useState } from 'react';
=======
import React, { useState, useEffect, useRef } from 'react';
>>>>>>> Stashed changes
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
<<<<<<< Updated upstream
import { useFocusEffect } from '@react-navigation/native';
=======
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
>>>>>>> Stashed changes
import { Colors } from '../../src/components/ui/colors';
import { Type } from '../../src/components/ui/typography';
import { NoteSection } from '../../src/components/ui';
import {
  findMockProjectById,
  findProjectContent,
  getVoiceCaptureSection,
} from '../../src/components/mock';
import { Images } from '../../src/assets/images';
import type { ChecklistStep, MockProject, ProjectSection } from '../../src/components/mock';

// ─── Types ────────────────────────────────────────────────────────────────────

// Local type mirrors ClipRecord from backend — swap import when backend lands
interface CapturedNote {
  id: string;
  templateName: string;
  payload: Record<string, string | number | boolean>;
  rawTranscript: string;
  confidenceScore: number;
  capturedAt: string;
}

type CaptureState = 'idle' | 'recording' | 'parsing';

// Flip to false once backend voice pipeline is wired
const USE_MOCK = true;

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

function NoteCard({ note, onDelete }: { note: CapturedNote; onDelete: () => void }) {
  const renderRightActions = () => (
    <Pressable onPress={onDelete} style={styles.deleteAction}>
      <Text style={styles.deleteLabel}>Delete</Text>
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View style={styles.noteCard}>
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
      </View>
    </Swipeable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [noteRefresh, setNoteRefresh] = useState(0);

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [capturedNotes, setCapturedNotes] = useState<CapturedNote[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation while recording
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

  useFocusEffect(
    useCallback(() => {
      setNoteRefresh(n => n + 1);
    }, []),
  );

  void noteRefresh;

  if (!project) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Project not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  async function handleCapturePress() {
    if (captureState === 'parsing') return;

    if (USE_MOCK) {
      if (captureState === 'idle') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCaptureState('recording');
      } else if (captureState === 'recording') {
        setCaptureState('parsing');
        const note: CapturedNote = {
          id: Math.random().toString(36).slice(2),
          templateName: 'Field Note',
          payload: { observation: 'Sample parsed field' },
          rawTranscript: 'This is a simulated voice note capture.',
          confidenceScore: 0.92,
          capturedAt: new Date().toISOString(),
        };
        setCapturedNotes((prev: CapturedNote[]) => [note, ...prev]);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCaptureState('idle');
      }
      return;
    }

    // Real implementation — wire up once backend lands:
    // if (captureState === 'idle') {
    //   const granted = await requestMicPermission();
    //   if (!granted) return;
    //   const recording = await startRecording();
    //   setActiveRecording(recording);
    //   setCaptureState('recording');
    // } else if (captureState === 'recording') {
    //   setCaptureState('parsing');
    //   const uri = await stopRecording(activeRecording!);
    //   const result = await parseVoice(uri, template);
    //   if (result) setCapturedNotes(prev => [result.record, ...prev]);
    //   setCaptureState('idle');
    // }
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

<<<<<<< Updated upstream
  const voiceSection: ProjectSection | null = getVoiceCaptureSection(
    project.id,
  );
=======
  const captureBtnBg =
    captureState === 'recording' ? '#E53E3E'
    : captureState === 'parsing'  ? Colors.textTertiary
    : Colors.orange;
>>>>>>> Stashed changes

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topIcon}>
          <Image source={Images.clipLogo} style={{ width: 30, height: 32 }} resizeMode="contain" />
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

        {/* Captured notes — newest at top */}
        {capturedNotes.length > 0 && (
          <View style={styles.capturedSection}>
            {capturedNotes.map((note: CapturedNote) => (
              <NoteCard key={note.id} note={note} onDelete={() => deleteNote(note.id)} />
            ))}
            <View style={styles.capturedDivider} />
          </View>
        )}

        {/* Existing content */}
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
        ) : !voiceSection ? (
          <View style={styles.sectionsContainer}>
            <EmptyProjectNotes project={project} />
          </View>
        ) : null}

        {voiceSection ? (
          <View style={styles.sectionsContainer}>
            <NoteSection section={voiceSection} />
          </View>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Capture bar */}
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

  // Captured notes
  capturedSection: {
    marginBottom: 8,
    gap: 10,
  },
  capturedDivider: {
    height: 1,
    backgroundColor: Colors.borderSubtle ?? '#E5E7EB',
    marginTop: 8,
    marginBottom: 20,
  },
  noteCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle ?? '#E5E7EB',
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
    color: Colors.textSecondary ?? Colors.textTertiary,
    marginTop: 2,
  },
  deleteAction: {
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 12,
    marginLeft: 8,
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
