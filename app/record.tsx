import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../src/components/ui/colors';
import { Type } from '../src/components/ui/typography';
import {
  findProjectById,
  MOCK_PROJECTS,
  recordMockCapture,
} from '../src/components/mock';
import { Images } from './images/assets';

type CaptureState = 'idle' | 'listening' | 'preview';

const MOCK_PARSED_TEXT =
  'pH: 8.1\nSalinity: 35 ppt\nTemperature: 26.4°C\nVisibility: 8m\nNotes: Probe calibrated. Survey conditions good.';

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function RecordScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId;
  const router = useRouter();

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const project = projectId ? findProjectById(MOCK_PROJECTS, projectId) : null;

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

  function handleMicPress() {
    if (captureState === 'idle') {
      setCaptureState('listening');
    } else if (captureState === 'listening') {
      setCaptureState('preview');
    }
  }

  function handleConfirm() {
    if (projectId) {
      recordMockCapture(projectId, MOCK_PARSED_TEXT.split('\n')[0]);
    }
    router.back();
  }

  function handleDiscard() {
    setCaptureState('idle');
  }

  const screenLabelText =
    captureState === 'idle'
      ? 'Capture'
      : captureState === 'listening'
      ? 'Listening…'
      : 'Review';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
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
        <Images.ClipLogo width={26} height={28} />
      </View>

      {project ? (
        <Text style={styles.projectTitle}>{project.title}</Text>
      ) : null}
      <Text style={styles.screenLabel}>{screenLabelText}</Text>

      {/* Preview state */}
      {captureState === 'preview' ? (
        <ScrollView
          contentContainerStyle={styles.previewScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.previewCard}>
            <Text style={styles.previewCardLabel}>Captured note</Text>
            <Text style={styles.previewText}>{MOCK_PARSED_TEXT}</Text>
          </View>
          <View style={styles.previewActions}>
            <Pressable
              style={({ pressed }: { pressed: boolean }) => [
                styles.confirmBtn,
                pressed && styles.confirmBtnPressed,
              ]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmLabel}>Confirm</Text>
            </Pressable>
            <Pressable
              style={({ pressed }: { pressed: boolean }) => [
                styles.discardBtn,
                pressed && styles.discardBtnPressed,
              ]}
              onPress={handleDiscard}
            >
              <Text style={styles.discardLabel}>Discard</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        /* Idle / listening state */
        <View style={styles.captureCenter}>
          {captureState === 'listening' ? (
            <Animated.View
              style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
            />
          ) : null}
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
          <Text style={styles.captureHint}>
            {captureState === 'idle' ? 'Tap to capture' : 'Tap to stop'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const MIC_SIZE = 80;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.backgroundScreen,
  },
  pressed: {
    opacity: 0.5,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    marginBottom: 8,
  },
  // Project / screen labels
  projectTitle: {
    ...Type.headline,
    color: Colors.textTertiary,
    paddingHorizontal: 24,
    marginBottom: 2,
  },
  screenLabel: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    paddingHorizontal: 24,
    marginBottom: 12,
  },

  // Idle / listening center
  captureCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
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
  },

  // Preview state
  previewScroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  previewCard: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  previewCardLabel: {
    ...Type.micro,
    color: Colors.textTertiary,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  previewText: {
    ...Type.body,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  previewActions: {
    gap: 10,
  },
  confirmBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnPressed: {
    backgroundColor: Colors.orangeDark,
  },
  confirmLabel: {
    ...Type.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  discardBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.backgroundScreen,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardBtnPressed: {
    opacity: 0.6,
  },
  discardLabel: {
    ...Type.bodyMedium,
    color: Colors.textSecondary,
    fontSize: 16,
  },
});
