import type { TextStyle } from 'react-native';

export const Type = {
  largeTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  headline: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 22,
  },
  subhead: {
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
    lineHeight: 16,
  },
  micro: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    lineHeight: 14,
  },
} as const satisfies Record<string, TextStyle>;
