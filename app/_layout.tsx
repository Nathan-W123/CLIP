import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { migrateDb } from '../src/db/migrate';

// VoiceParserProvider (cactus / Nitro) must NOT wrap the root — it breaks Expo Go and prevents
// this module from exporting a default → SQLiteProvider never mounts. Wrap only record/capture routes.

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="clip.db" onInit={migrateDb}>
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
    </SQLiteProvider>
  );
}
