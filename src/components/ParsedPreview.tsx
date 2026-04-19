// Shows the structured data Gemma 4 extracted from voice input.
// User confirms to save or discards to re-record.

import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { ParseResult } from '../voice/cactus';
import type { Template, FieldDefinition } from '../core/schemas';

interface Props {
  result: ParseResult;
  template: Template;
  onConfirm: () => void;
  onDiscard: () => void;
}

export function ParsedPreview({ result, template, onConfirm, onDiscard }: Props) {
  const { record, confidence, latencyMs } = result;
  const confidencePct = Math.round(confidence * 100);
  const isLowConfidence = confidence < 0.7;

  const fieldLabels: Record<string, string> =
    template.type === 'database_entry'
      ? Object.fromEntries(
          (template.schemaDefinition as FieldDefinition[]).map(f => [f.key, f.label]),
        )
      : {};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{template.name}</Text>
        <View style={[styles.badge, isLowConfidence && styles.badgeLow]}>
          <Text style={[styles.badgeText, isLowConfidence && styles.badgeTextLow]}>
            {confidencePct}% confidence
          </Text>
        </View>
      </View>

      {isLowConfidence && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            Low confidence — review carefully before saving
          </Text>
        </View>
      )}

      <ScrollView style={styles.fields} contentContainerStyle={styles.fieldsInner}>
        {Object.entries(record.payload).map(([key, value]) => (
          <View key={key} style={styles.row}>
            <Text style={styles.fieldKey}>{fieldLabels[key] ?? key}</Text>
            <Text style={styles.fieldValue}>{String(value)}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.transcript}>
        <Text style={styles.transcriptLabel}>Transcript</Text>
        <Text style={styles.transcriptText}>{record.rawTranscript}</Text>
      </View>

      <Text style={styles.latency}>{latencyMs}ms</Text>

      <View style={styles.actions}>
        <Pressable style={styles.discardBtn} onPress={onDiscard}>
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
        <Pressable style={styles.confirmBtn} onPress={onConfirm}>
          <Text style={styles.confirmText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  badge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeLow: {
    backgroundColor: '#FFF3E0',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  badgeTextLow: {
    color: '#E65100',
  },
  warning: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
  },
  warningText: {
    fontSize: 13,
    color: '#E65100',
  },
  fields: {
    flex: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
  },
  fieldsInner: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldKey: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111',
    flex: 2,
    textAlign: 'right',
  },
  transcript: {
    gap: 4,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#BBB',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  transcriptText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  latency: {
    fontSize: 11,
    color: '#CCC',
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  discardBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
  },
  confirmBtn: {
    flex: 2,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
