// Empty stub for argon2-browser's `require('../dist/argon2.wasm')`.
// React Native cannot load .wasm; argon2-browser falls back to its asm.js
// path when wasm is unavailable. Exporting an empty buffer causes the
// wasm init promise to reject, and argon2-browser then uses the asm fallback.
module.exports = new Uint8Array(0);
