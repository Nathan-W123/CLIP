import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from './colors';
import { Type } from './typography';
import type { ContentBlock } from '../mock/types';

interface Props {
  block: ContentBlock;
}

export function NoteBlock({ block }: Props): React.ReactElement | null {
  if (block.type === 'text') {
    return <Text style={styles.bodyText}>{block.body}</Text>;
  }

  if (block.type === 'note') {
    return (
      <View style={styles.noteRow}>
        <View style={styles.noteLeft}>
          <View style={styles.noteDot} />
          <View style={styles.noteThread} />
        </View>
        <View style={styles.noteContent}>
          <Text style={styles.noteTimestamp}>{block.timestamp}</Text>
          <Text style={styles.noteBody}>{block.body}</Text>
        </View>
      </View>
    );
  }

  if (block.type === 'progress') {
    const pct = Math.min(100, Math.round((block.current / block.total) * 100));
    return (
      <View style={styles.progressBlock}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.progressLabel}>
          {block.current} of {block.total} {block.label ?? 'steps'} · {pct}%
        </Text>
      </View>
    );
  }

  if (block.type === 'entry-list') {
    return (
      <View style={styles.entryList}>
        {block.entries.map(entry => (
          <View key={entry.id} style={styles.entryRow}>
            <View style={[styles.entryBubble, entry.done && styles.entryBubbleDone]}>
              {entry.done ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={[styles.entryLabel, entry.done && styles.entryLabelDone]}>
              {entry.label}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (block.type === 'fields') {
    return (
      <View style={styles.fieldList}>
        {block.fields.map((field, i) => (
          <View key={i} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Text style={styles.fieldValue}>{field.value}</Text>
          </View>
        ))}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  // Text block
  bodyText: {
    ...Type.body,
    color: Colors.textPrimary,
    lineHeight: 24,
  },

  // Note block
  noteRow: {
    flexDirection: 'row',
    gap: 8,
  },
  noteLeft: {
    alignItems: 'center',
    paddingTop: 3,
    width: 10,
  },
  noteDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.orange,
  },
  noteThread: {
    flex: 1,
    width: 1.5,
    backgroundColor: Colors.borderSubtle,
    marginTop: 4,
  },
  noteContent: {
    flex: 1,
    paddingBottom: 16,
    gap: 8,
  },
  noteTimestamp: {
    ...Type.caption,
    color: Colors.textTertiary,
  },
  noteBody: {
    ...Type.body,
    color: Colors.textPrimary,
    lineHeight: 22,
  },

  // Progress block
  progressBlock: {
    gap: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.orange,
  },
  progressLabel: {
    ...Type.caption,
    color: Colors.textTertiary,
  },

  // Entry list
  entryList: {
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  entryBubble: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  entryBubbleDone: {
    backgroundColor: Colors.orange,
    borderColor: Colors.orange,
  },
  checkmark: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
    lineHeight: 12,
  },
  entryLabel: {
    ...Type.body,
    color: Colors.textPrimary,
    flex: 1,
    lineHeight: 22,
  },
  entryLabelDone: {
    color: Colors.textTertiary,
  },

  // Fields
  fieldList: {
    gap: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldLabel: {
    ...Type.subhead,
    color: Colors.textTertiary,
    flex: 1,
  },
  fieldValue: {
    ...Type.subhead,
    color: Colors.textPrimary,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
});
