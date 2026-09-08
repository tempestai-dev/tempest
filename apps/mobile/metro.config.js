const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Shared protocol types + crypto + transport are vendored under lib/tempest/.
// Aliased so source keeps the `@tempest/*` specifier without depending on the
// monorepo — this app installs and bundles as a standalone Expo project.
config.resolver.extraNodeModules = {
  '@tempest/core': path.resolve(projectRoot, 'lib/tempest/core'),
  '@tempest/crypto': path.resolve(projectRoot, 'lib/tempest/crypto'),
  '@tempest/transport': path.resolve(projectRoot, 'lib/tempest/transport'),
};
config.resolver.assetExts.push('glb', 'gltf', 'bin');

// SVG-as-React-component (agent icons). Reclassifies .svg from an asset to a
// source module so react-native-svg-transformer can turn it into a component.
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

module.exports = config;
