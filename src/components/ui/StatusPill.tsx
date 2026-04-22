import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Type } from './typography';

export type PillStatus = 'synced' | 'pending' | 'draft' | 'active';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  dot?: string; // omit to hide dot
}

const STATUS_CONFIG: Record<PillStatus, StatusConfig> = {
  synced:  { label: 'Synced',  bg: '#D4F7B0', text: '#1F7A00' },
  pending: { label: 'Pending', bg: '#555555', text: '#FFFFFF' },
  draft:   { label: 'Draft',   bg: '#EBEBEB', text: '#666666', dot: '#AAAAAA' },
  active:  { label: 'Active',  bg: '#FFF0E6', text: '#D24F18', dot: '#E76400' },
};

interface Props {
  status: PillStatus;
  label?: string;
}

export function StatusPill({ status, label }: Props) {
  const config = STATUS_CONFIG[status];
  const displayLabel = label ?? config.label;

  return (
    <View style={[styles.pill, { backgroundColor: config.bg }]}>
      {config.dot ? (
        <View style={[styles.dot, { backgroundColor: config.dot }]} />
      ) : null}
      <Text style={[styles.text, { color: config.text }]}>{displayLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  text: {
    ...Type.caption,
    fontWeight: '500',
  },
});
