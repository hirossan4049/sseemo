// Pure-JS base64 helpers. Avoid Buffer.from(s, 'base64') / Buffer.toString('base64')
// because `@craftzdog/react-native-buffer` delegates to native quick-base64 and
// the linked native version is missing base64ToArrayBuffer/base64FromArrayBuffer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const base64js: {
  fromByteArray: (u: Uint8Array) => string;
  toByteArray: (s: string) => Uint8Array;
} = require('base64-js');

export function b64encode(bytes: Uint8Array | Buffer): string {
  const u =
    bytes instanceof Uint8Array && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes
      : new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return base64js.fromByteArray(u);
}

export function b64decode(s: string): Buffer {
  return Buffer.from(base64js.toByteArray(s));
}
