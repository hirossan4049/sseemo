const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Node core module polyfills for libs like aws4.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  url: require.resolve('url/'),
  querystring: require.resolve('querystring-es3'),
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer/'),
  events: require.resolve('events/'),
  process: require.resolve('process/browser'),
  path: require.resolve('path-browserify'),
};

module.exports = config;
