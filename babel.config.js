// Explicit preset so Babel matches Metro + react-native-svg-transformer/expo (Expo default when this file is missing, but
// having it here keeps `npx expo` and editor tooling aligned with the same pipeline as the dev client).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
