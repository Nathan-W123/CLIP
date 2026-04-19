import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Colors } from './colors';
import { Type } from './typography';

// 'micro'   — ALL CAPS, 11pt, used in card interiors and dense lists
// 'section' — Mixed case, 17pt regular, used as top-level page section labels
export type SectionHeaderVariant = 'micro' | 'section';

interface Props {
  label: string;
  variant?: SectionHeaderVariant;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function SectionHeader({
  label,
  variant = 'micro',
  action,
  onAction,
  style,
}: Props) {
  const isSection = variant === 'section';

  return (
    <View style={[isSection ? styles.rowSection : styles.rowMicro, style]}>
      <Text style={isSection ? styles.labelSection : styles.labelMicro}>
        {isSection ? label : label.toUpperCase()}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowMicro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 24,
  },
  rowSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 24,
  },
  labelMicro: {
    ...Type.micro,
    color: Colors.textTertiary,
    letterSpacing: 0.8,
  },
  labelSection: {
    ...Type.body,
    color: '#888888',
    fontWeight: '400',
  },
  action: {
    ...Type.caption,
    color: Colors.orange,
  },
});
