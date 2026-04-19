// Required so `.svg` imports are React components (via react-native-svg-transformer),
// not numeric asset IDs — otherwise `<Foo />` where Foo is a number causes
// "Element type is invalid ... got: number".
const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  const { transformer, resolver } = config;

  config.transformer = {
    ...transformer,
    // Must use `/expo` so non-SVG files still go through Expo's Babel transformer.
    // Plain `react-native-svg-transformer` breaks that chain → invalid element types / assets.
    babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
  };
  config.resolver = {
    ...resolver,
    assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...resolver.sourceExts, 'svg'],
  };

  return config;
})();
