import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
  type ListRenderItem,
} from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listRecentCapturesForTemplate, type CaptureRow } from '../db/capturesRepository';
import { Colors } from './ui/colors';
import { StatusPill } from './ui/StatusPill';

type Props = {
  db: SQLiteDatabase;
  templateId: string;
  /** Increment after a save to reload the list. */
  refreshNonce?: number;
};

function formatPayloadPreview(parsedJson: string): string {
  try {
    const v = JSON.parse(parsedJson) as unknown;
    const s = JSON.stringify(v, null, 2);
    if (s.length > 600) return `${s.slice(0, 600)}…`;
    return s;
  } catch {
    const t = parsedJson.trim();
    return t.length > 400 ? `${t.slice(0, 400)}…` : t || '(empty)';
  }
}

export function LocalCapturesInspector({ db, templateId, refreshNonce = 0 }: Props) {
  const [rows, setRows] = useState<CaptureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await listRecentCapturesForTemplate(db, templateId, 40);
    setRows(data);
  }, [db, templateId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load, refreshNonce]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const renderItem: ListRenderItem<CaptureRow> = useCallback(({ item }) => {
    const when = new Date(item.created_at).toLocaleString();
    const raw =
      item.raw_transcript.length > 160
        ? `${item.raw_transcript.slice(0, 160)}…`
        : item.raw_transcript;
    const payload = formatPayloadPreview(item.parsed_json);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.time}>{when}</Text>
          <StatusPill status={item.synced === 1 ? 'synced' : 'pending'} />
        </View>
        <Text style={styles.monoLabel}>raw</Text>
        <Text style={styles.raw}>{raw || '—'}</Text>
        <Text style={styles.monoLabel}>parsed JSON</Text>
        <Text style={styles.payload}>{payload}</Text>
        <Text style={styles.meta}>
          id {item.id.slice(0, 8)}… · {item.source}
          {item.master_table ? ` · ${item.master_table}` : ''}
        </Text>
      </View>
    );
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Local SQLite (this template)</Text>
      <Text style={styles.sectionHint}>Latest rows from captures on device. Pull to refresh.</Text>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.textPrimary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No captures stored locally for this template yet.</Text>
          }
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 120,
    maxHeight: 320,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 8,
  },
  center: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 16,
  },
  empty: {
    fontSize: 14,
    color: Colors.textSecondary,
    paddingVertical: 16,
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  time: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  monoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 2,
  },
  raw: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  payload: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  meta: {
    marginTop: 8,
    fontSize: 10,
    color: Colors.textTertiary,
  },
});
