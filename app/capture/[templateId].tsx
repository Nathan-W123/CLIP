// Capture screen — shows the template name and VoiceCapture component.
// Navigates back to home after a successful save.

import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getTemplateByIdWithDb } from '../../src/core/sqlite.expo';
import { VoiceParserProvider } from '../../src/voice/VoiceParserProvider';
import { VoiceCapture } from '../../src/components/VoiceCapture';
import { Images } from '../../src/assets/images';
import { Colors } from '../../src/components/ui/colors';
import type { Template, ClipRecord } from '../../src/core/schemas';

export default function CaptureScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const [template, setTemplate] = useState<Template | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getTemplateByIdWithDb(db, templateId);
      if (!cancelled) setTemplate(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, templateId]);

  const handleSaved = (_record: ClipRecord) => {
    router.back();
  };

  if (template === undefined) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!template) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.notFound}>Template not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <VoiceParserProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header onBack={() => router.back()} />
        <View style={styles.container}>
          <Text style={styles.title}>{template.name}</Text>
          <Text style={styles.hint}>
            {template.type === 'checklist'
              ? 'Speak each step aloud. Say "confirmed" or describe any notes.'
              : 'Describe the data you want to capture. Be specific.'}
          </Text>
          <View style={styles.captureArea}>
            <VoiceCapture template={template} onSaved={handleSaved} />
          </View>
        </View>
      </SafeAreaView>
    </VoiceParserProvider>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      >
        <Images.BackIcon width={22} height={18} />
      </Pressable>
      <Image source={Images.clipLogo} style={{ width: 26, height: 28 }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.backgroundScreen,
  },
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    marginBottom: 8,
  },
  pressed: {
    opacity: 0.5,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    fontSize: 16,
    color: Colors.textTertiary,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  hint: {
    fontSize: 14,
    color: Colors.textTertiary,
    lineHeight: 20,
    marginBottom: 40,
  },
  captureArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});