// Background sync runner — keeps syncing without rendering UI.

import React, { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { flushPendingCaptures } from '../services/syncCaptures';

export function SyncStatus() {
  const db = useSQLiteContext();

  useEffect(() => {
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        await flushPendingCaptures(db);
      } finally {
        running = false;
      }
    };

    void refresh();
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        void refresh();
      }
    });
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refresh();
      }
    });
    const id = setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      clearInterval(id);
      unsubscribeNetInfo();
      appStateSub.remove();
    };
  }, [db]);

  return null;
}
