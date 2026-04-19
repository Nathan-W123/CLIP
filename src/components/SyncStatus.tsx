// Background sync status indicator — shows pending count in a non-intrusive pill.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getPendingSyncItems } from '../core/sqlite.expo';

export function SyncStatus() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const check = () => setPending(getPendingSyncItems().length);
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

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
