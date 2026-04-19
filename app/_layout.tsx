import { Stack } from 'expo-router';

// Backend calls disabled for frontend-only development.
// Restore initDatabase() and syncDown() when integrating backend.

export default function RootLayout() {
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
