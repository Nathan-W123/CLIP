import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from './colors';
import { Type } from './typography';

interface Props {
  icon: string;
  title: string;
  description?: string;
  onPress: () => void;
}

export function TemplateTile({ icon, title, description, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {description ? (
          <Text style={styles.description} numberOfLines={1}>{description}</Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  pressed: {
    opacity: 0.65,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  icon: {
    fontSize: 20,
  },
  text: {
    flex: 1,
    gap: 8,
  },
  title: {
    ...Type.headline,
    color: Colors.textPrimary,
  },
  description: {
    ...Type.subhead,
    color: Colors.textTertiary,
  },
  chevron: {
    fontSize: 20,
    color: Colors.border,
    marginRight: -2,
  },
});
