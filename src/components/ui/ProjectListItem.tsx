import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from './colors';
import { Type } from './typography';
import { StatusPill, type PillStatus } from './StatusPill';

interface Props {
  title: string;
  subtitle?: string;
  status: PillStatus;
  captureCount?: number;
  lastUpdated?: string;
  onPress: () => void;
}

export function ProjectListItem({
  title,
  subtitle,
  status,
  captureCount,
  lastUpdated,
  onPress,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.dot}>
        <View style={styles.dotInner} />
      </View>

      <View style={styles.content}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <StatusPill status={status} />
        </View>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
        <View style={styles.meta}>
          {captureCount !== undefined ? (
            <Text style={styles.metaText}>{captureCount} captures</Text>
          ) : null}
          {captureCount !== undefined && lastUpdated ? (
            <Text style={styles.metaDot}>·</Text>
          ) : null}
          {lastUpdated ? (
            <Text style={styles.metaText}>{lastUpdated}</Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    gap: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  dotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.orange,
  },
  content: {
    flex: 1,
    gap: 8,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    ...Type.headline,
    color: Colors.textPrimary,
    flex: 1,
  },
  subtitle: {
    ...Type.subhead,
    color: Colors.textTertiary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  metaText: {
    ...Type.caption,
    color: Colors.textTertiary,
  },
  metaDot: {
    ...Type.caption,
    color: Colors.border,
  },
  chevron: {
    fontSize: 18,
    color: Colors.border,
    marginTop: 2,
  },
});
