import React from 'react';
import { View } from 'react-native';
import { Colors } from './colors';

interface Props {
  // Should match the screen background so the clasp visually "cuts through" the board border.
  bgColor?: string;
  size?: number;
}

export function ClipboardIcon({ bgColor = Colors.backgroundScreen, size = 30 }: Props) {
  const claspHeight = Math.round(size * 0.27);
  const stroke = Math.round(size * 0.073);

  return (
    <View style={{ width: size, height: size + Math.round(claspHeight * 0.5), alignItems: 'center' }}>
      {/* Board */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: size,
          borderRadius: Math.round(size * 0.17),
          borderWidth: stroke,
          borderColor: Colors.textPrimary,
        }}
      />
      {/* Clasp */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: Math.round(size * 0.37),
          height: claspHeight,
          borderRadius: stroke * 2,
          borderWidth: stroke,
          borderColor: Colors.textPrimary,
          backgroundColor: bgColor,
        }}
      />
    </View>
  );
}
