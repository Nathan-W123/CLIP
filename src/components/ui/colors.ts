export const Colors = {
  // Brand
  orange: '#E76400',
  orangeLight: '#FBA253',
  orangeDark: '#D24F18',
  orangeDeep: '#9D3205',

  // State
  green: '#53D900',
  searchBlue: '#272D45',

  // Backgrounds
  background: '#FFFFFF',
  backgroundScreen: '#F2F2F2',
  surface: '#F7F7F5',
  surfaceElevated: '#FFFFFF',

  // Borders
  border: '#EBEBEB',
  borderSubtle: '#F2F2F0',

  // Text
  textPrimary: '#111111',
  textSecondary: '#555555',
  textTertiary: '#AAAAAA',
  textInverse: '#FFFFFF',

  // Status semantic
  statusSynced: '#53D900',
  statusPending: '#FBA253',
  statusDraft: '#AAAAAA',
  statusActive: '#E76400',
} as const;

export type ColorKey = keyof typeof Colors;
