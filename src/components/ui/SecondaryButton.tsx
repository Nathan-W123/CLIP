import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Colors } from './colors';
import { Type } from './typography';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function SecondaryButton({ label, onPress, disabled = false }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: Colors.background,
  },
  disabled: {
    borderColor: Colors.borderSubtle,
  },
  pressed: {
    backgroundColor: Colors.surface,
  },
  label: {
    ...Type.bodyMedium,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  labelDisabled: {
    color: Colors.textTertiary,
  },
});
