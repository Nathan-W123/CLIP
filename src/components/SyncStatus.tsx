// Background sync runner — keeps syncing without rendering UI.

import React, { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { trySyncCaptures } from '../services/syncCaptures';

export function SyncStatus() {
  const db = useSQLiteContext();

  useEffect(() => {
    const refresh = async () => {
      await trySyncCaptures(db);
    };
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 8000);
    return () => clearInterval(id);
  }, [db]);

  return null;
}
