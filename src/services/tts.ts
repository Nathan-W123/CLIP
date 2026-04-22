/**
 * Text-to-speech using the Piper backend endpoint (GET /tts?text=...).
 * expo-av loads and plays the WAV audio streamed from the server.
 */
import { Audio } from 'expo-av';
import { ttsUrl } from './transcribe';

export async function speakText(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const { sound } = await Audio.Sound.createAsync({ uri: ttsUrl(trimmed) });
  sound.setOnPlaybackStatusUpdate(status => {
    if (status.isLoaded && status.didJustFinish) {
      void sound.unloadAsync();
    }
  });
  await sound.playAsync();
}
