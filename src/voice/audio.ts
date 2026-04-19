import { Audio } from 'expo-av';

export type ActiveRecording = { recording: Audio.Recording };

export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function startRecording(): Promise<ActiveRecording> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  return { recording };
}

export async function stopRecording(active: ActiveRecording): Promise<string> {
  await active.recording.stopAndUnloadAsync();
  const uri = active.recording.getURI();
  if (!uri) throw new Error('Recording produced no file URI');
  return uri;
}
