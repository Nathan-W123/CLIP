import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export type ActiveRecording = { recording: Audio.Recording };

/** iOS: 16 kHz mono PCM WAV — matches on-device file transcription expectations. */
function recordingOptions(): Audio.RecordingOptions {
  return {
    isMeteringEnabled: true,
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: '.wav',
      outputFormat: Audio.IOSOutputFormat.LINEARPCM,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  };
}

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
  await recording.prepareToRecordAsync(
    Platform.OS === 'ios' ? recordingOptions() : Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  await recording.startAsync();
  return { recording };
}

export async function stopRecording(active: ActiveRecording): Promise<string> {
  await active.recording.stopAndUnloadAsync();
  const uri = active.recording.getURI();
  if (!uri) throw new Error('Recording produced no file URI');
  return uri;
}
