// Background sync status indicator — shows pending count in a non-intrusive pill.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { countPendingSync } from '../db/capturesRepository';
import { trySyncCaptures } from '../services/syncCaptures';

export function SyncStatus() {
  const db = useSQLiteContext();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      try {
        await trySyncCaptures(db);
      } finally {
        const n = await countPendingSync(db);
        setPending(n);
      }
    };
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 8000);
    return () => clearInterval(id);
  }, [db]);

  if (pending === 0) return null;

  return (
    <View style={styles.pill}>
      <View style={styles.dot} />
      <Text style={styles.text}>{pending} pending sync</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFA000',
  },
  text: {
    fontSize: 12,
    color: '#F57F17',
    fontWeight: '500',
  },
});
