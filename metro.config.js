const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

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

// argon2-browser tries to `require('../dist/argon2.wasm')`. On React Native
// we don't have wasm support; alias it to an empty stub so Metro can bundle.
// (Native crypto path / future native argon2 module will replace this at runtime.)
const argon2WasmStub = path.resolve(__dirname, 'src/shims/argon2-wasm-stub.js');
const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('argon2.wasm') || moduleName === '../dist/argon2.wasm') {
    return { type: 'sourceFile', filePath: argon2WasmStub };
  }
  // The asm.js fallback (argon2.js) requires Node `fs` etc. and is unusable in
  // RN. argon2 derivation will be provided by a native module at runtime; here
  // we just stub so Metro can resolve the import.
  if ((moduleName === '../dist/argon2.js' || moduleName.endsWith('/argon2.js')) &&
      context.originModulePath && context.originModulePath.includes('argon2-browser')) {
    return { type: 'sourceFile', filePath: argon2WasmStub };
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
