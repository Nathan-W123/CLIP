import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [noteRefresh, setNoteRefresh] = useState(0);

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

  function handleCapturePress() {
    const projectId = Array.isArray(id) ? id[0] : id;
    if (!projectId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/record?projectId=${encodeURIComponent(String(projectId))}` as never);
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

  const voiceSection: ProjectSection | null = getVoiceCaptureSection(
    project.id,
  );

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
          style={[styles.captureBtn, { backgroundColor: Colors.orange }]}
          onPress={handleCapturePress}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Images.MicIcon width={18} height={22} />
            <Text style={styles.captureLabel}>Capture</Text>
          </View>
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
