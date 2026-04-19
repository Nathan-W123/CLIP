import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from './colors';
import { Type } from './typography';
import { NoteBlock } from './NoteBlock';
import type { ProjectSection } from '../mock/types';

interface Props {
  section: ProjectSection;
}

export function NoteSection({ section }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{section.title.toUpperCase()}</Text>
      <View style={styles.blocks}>
        {section.blocks.map((block, i) => (
          <NoteBlock key={`${section.id}-block-${i}`} block={block} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    gap: 8,
  },
  title: {
    ...Type.micro,
    color: Colors.textTertiary,
    letterSpacing: 0.9,
  },
  blocks: {
    gap: 8,
  },
});
