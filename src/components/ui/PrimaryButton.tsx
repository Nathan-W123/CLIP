import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from './colors';
import { Type } from './typography';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function PrimaryButton({ label, onPress, disabled = false, loading = false }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={Colors.textInverse} size="small" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  disabled: {
    backgroundColor: Colors.border,
  },
  pressed: {
    backgroundColor: Colors.orangeDark,
  },
  label: {
    ...Type.bodyMedium,
    color: Colors.textInverse,
    fontWeight: '600',
  },
});
