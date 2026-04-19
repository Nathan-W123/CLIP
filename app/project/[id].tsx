import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../src/components/ui/colors';
import { Type } from '../../src/components/ui/typography';
import { NoteSection } from '../../src/components/ui';
import {
  findMockProjectById,
  findProjectContent,
} from '../../src/components/mock';
import { Images } from '../images/assets';
import type { ChecklistStep, MockProject, ProjectSection } from '../../src/components/mock';

// ─── Star badge ───────────────────────────────────────────────────────────────

function StarBadge() {
  return (
    <View style={styles.starBadge}>
      <Images.BlackStarIcon width={34} height={34} />
    </View>
  );
}

// ─── Step block (matches Figma: "N. Title · Completed · Time") ───────────────

function StepBlock({ step }: { step: ChecklistStep }) {
  const header = `${step.order}. ${step.title} · Completed · ${step.completedAt ?? ''}`;

  return (
    <View style={styles.stepBlock}>
      <Text style={styles.stepHeader}>{header}</Text>
      {step.body ? (
        <Text style={styles.stepBody}>{step.body}</Text>
      ) : null}
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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Clipboard icon top-left */}
        <View style={styles.topIcon}>
          <Images.ClipLogo width={30} height={32} />
        </View>

        {/* Back arrow */}
        <Pressable
          style={({ pressed }: { pressed: boolean }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
          ]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Images.BackIcon width={22} height={18} />
        </Pressable>

        {/* Title + star badge */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{project.title}</Text>
          <StarBadge />
        </View>
        <Text style={styles.typeLabel}>{typeLabel}</Text>

        {/* Content: steps (Figma format) or NoteSection fallback */}
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

      {/* Capture button */}
      <View style={styles.captureBar}>
        <Pressable
          style={({ pressed }: { pressed: boolean }) => [
            styles.captureBtn,
            pressed && styles.captureBtnPressed,
          ]}
          onPress={() =>
            router.push(`/record?projectId=${project.id}` as never)
          }
        >
          <Images.MicIcon width={18} height={22} />
          <Text style={styles.captureLabel}>Capture</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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

  // Top
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
  // Title
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
  stepsContainer: {
    gap: 0,
  },
  stepDivider: {
    height: 32,
  },
  stepBlock: {
    gap: 10,
  },
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
  entriesBlock: {
    gap: 3,
    marginTop: 2,
  },
  entryLine: {
    ...Type.body,
    color: Colors.textPrimary,
    lineHeight: 24,
  },

  // NoteSection fallback
  sectionsContainer: {
    gap: 0,
  },

  // Empty / not found
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    ...Type.body,
    color: Colors.textTertiary,
  },
  emptyText: {
    ...Type.body,
    color: Colors.textTertiary,
    marginTop: 24,
  },

  // Capture bar
  bottomSpacer: {
    height: 20,
  },
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
    backgroundColor: Colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 36,
    gap: 8,
  },
  captureBtnPressed: {
    backgroundColor: Colors.orangeDark,
  },
  captureLabel: {
    ...Type.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 17,
  },
});
