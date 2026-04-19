import BackIcon from './icons/back_icon.svg';
import BlackStarIcon from './icons/black_star_icon.svg';
import MicIcon from './icons/mic_icon.svg';
import ProjectStarIcon from './icons/project_star_icon.svg';
import SearchIcon from './icons/search_icon.svg';

/**
 * SVG → components via metro + react-native-svg-transformer/expo.
 * PNG uses require() numeric IDs with `<Image source={...} />`.
 * Logo uses PNG (`clip_logo.png`). Do not swap in multi‑MB SVGs as components — SVGR/RN may crash at runtime.
 */
export const Images = {
  BackIcon,
  BlackStarIcon,
  MicIcon,
  ProjectStarIcon,
  SearchIcon,
  clipLogo: require('./icons/clip_logo.png') as number,
  checklistIcon: require('./icons/checklist_icon.png') as number,
  dataCollectionIcon: require('./icons/data_collection_icon.png') as number,
} as const;
