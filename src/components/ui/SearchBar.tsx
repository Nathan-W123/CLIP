import React from 'react';
import { View, TextInput, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from './colors';
import { Type } from './typography';
import { Images } from '../../assets/images';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search', onClear }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Images.SearchIcon width={15} height={15} />
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        returnKeyType="search"
        clearButtonMode="never"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value.length > 0 && onClear ? (
        <Pressable onPress={onClear} hitSlop={8} style={styles.clearBtn}>
          <Text style={styles.clearIcon}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.searchBlue + '18',
    paddingHorizontal: 16,
    height: 48,
    gap: 8,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    ...Type.body,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 8,
  },
  clearIcon: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
});
