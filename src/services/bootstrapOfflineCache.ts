import NetInfo from '@react-native-community/netinfo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { syncTemplateCatalogFromSupabase } from './syncTemplateCatalog';
import { refreshLearnedSchemaCacheFromSupabase } from './schemaLearning';
import { loadMasterDbCache, syncMasterDbCacheFromSupabase } from './masterDbCache';

export type BootCacheResult = {
  online: boolean;
  templatesUpserted: number;
  templateError?: string;
};

/**
 * On app boot, opportunistically pull Supabase-backed template/schema knowledge into local cache.
 * App remains fully usable offline with existing SQLite templates even when this step is skipped.
 */
export async function bootstrapOfflineCache(
  db: SQLiteDatabase,
): Promise<BootCacheResult> {
  // Always load local master DB rows into memory — works fully offline.
  await loadMasterDbCache(db);

  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    return { online: false, templatesUpserted: 0 };
  }

  const syncResult = await syncTemplateCatalogFromSupabase(db);
  await refreshLearnedSchemaCacheFromSupabase();
  await syncMasterDbCacheFromSupabase();

  return {
    online: true,
    templatesUpserted: syncResult.upserted,
    templateError: syncResult.error,
  };
}
