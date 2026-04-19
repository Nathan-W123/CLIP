import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { migrateDb } from '../src/db/migrate';
import { bootstrapOfflineCache } from '../src/services/bootstrapOfflineCache';

function AppStack() {
  const db = useSQLiteContext();

  useEffect(() => {
    void bootstrapOfflineCache(db);
  }, [db]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#F2F2F2' },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 17, color: '#111111' },
        contentStyle: { backgroundColor: '#F2F2F2' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="project/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="record" options={{ headerShown: false }} />
      <Stack.Screen name="history" options={{ headerShown: false }} />
      <Stack.Screen name="capture/[templateId]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="clip.db" onInit={migrateDb}>
      <AppStack />
    </SQLiteProvider>
  );
}