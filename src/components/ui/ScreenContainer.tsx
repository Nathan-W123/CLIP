import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from './colors';

type SafeEdge = 'top' | 'bottom' | 'left' | 'right';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  safeEdges?: SafeEdge[];
  style?: ViewStyle;
}

export function ScreenContainer({
  children,
  scroll = false,
  padded = true,
  safeEdges = ['bottom'],
  style,
}: Props) {
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, padded && styles.padded, style]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padded && styles.padded, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={safeEdges}>
      {inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.backgroundScreen,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
});
