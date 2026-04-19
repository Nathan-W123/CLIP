import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../src/components/ui/colors';
import { Type } from '../src/components/ui/typography';
import { StatusPill } from '../src/components/ui';
import { MOCK_HISTORY } from '../src/components/mock';
import { Images } from './images/assets';

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const router = useRouter();

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

      <Text style={styles.title}>History</Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {MOCK_HISTORY.map(entry => (
          <View key={entry.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardProject} numberOfLines={1}>
                {entry.projectTitle}
              </Text>
              <StatusPill status={entry.syncStatus} />
            </View>
            <Text style={styles.cardTimestamp}>{entry.capturedAt}</Text>
            <Text style={styles.cardSummary}>{entry.summary}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  // Page title
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    paddingHorizontal: 24,
    marginBottom: 16,
  },

  // Cards list
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 10,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardProject: {
    ...Type.headline,
    color: Colors.textPrimary,
    flex: 1,
  },
  cardTimestamp: {
    ...Type.caption,
    color: Colors.textTertiary,
  },
  cardSummary: {
    ...Type.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
});
