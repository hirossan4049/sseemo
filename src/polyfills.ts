/**
 * RN ランタイムで Buffer / global crypto / process を有効化。
 * index.js の最上段で読み込まれる。
 *
 * 注意: readable-stream など Node コアを参照するライブラリは
 *      `process.version.slice(...)` をモジュール評価時に呼び出す。
 *      Hermes が提供する `process` は `.version` を持たないため、
 *      Node 互換の polyfill フィールドを必ず先に補う必要がある。
 */
import { Buffer as BufferPolyfill } from 'buffer';
import { install } from 'react-native-quick-crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const base64js: {
  fromByteArray: (u: Uint8Array) => string;
  toByteArray: (s: string) => Uint8Array;
} = require('base64-js');

// @ts-ignore
const g: any = global;
if (!g.process) g.process = {};
if (typeof g.process.browser === 'undefined') g.process.browser = true;
if (typeof g.process.version === 'undefined') g.process.version = '';
if (!g.process.versions) g.process.versions = {};
if (!g.process.env) g.process.env = { NODE_ENV: __DEV__ ? 'development' : 'production' };
if (typeof g.process.nextTick !== 'function') {
  g.process.nextTick = (cb: (...a: any[]) => void, ...args: any[]) => {
    setTimeout(() => cb(...args), 0);
  };
}

install();

// 1) Restore the pure-JS Buffer on global so app code & libs that read
//    global.Buffer get the safe implementation.
g.Buffer = BufferPolyfill;

// 2) Patch @craftzdog/react-native-buffer's prototype so transitive callers
//    that imported its Buffer class directly (notably react-native-quick-crypto
//    internals) ALSO use base64-js for the 'base64' encoding. Other encodings
//    (utf8/hex/etc.) keep their existing fast paths.
//    Root cause: craftzdog requires `react-native-quick-base64@^3` whose JS
//    calls native `base64FromArrayBuffer`, but RN 0.75 can't compile v3's
//    native side (`getStringData` JSI API doesn't exist yet). We're stuck on
//    v2.x natively, so we route base64 through base64-js JS instead.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const craft = require('@craftzdog/react-native-buffer');
  const CB = craft.Buffer;
  if (CB && CB.prototype) {
    const origToString = CB.prototype.toString;
    CB.prototype.toString = function patchedToString(encoding?: string, start?: number, end?: number) {
      if (encoding === 'base64' || encoding === 'base64url') {
        const view = new Uint8Array(this.buffer, this.byteOffset, this.byteLength);
        const sliced = view.subarray(start ?? 0, end ?? view.length);
        const u8 =
          sliced.byteOffset === 0 && sliced.byteLength === sliced.buffer.byteLength
            ? sliced
            : new Uint8Array(sliced);
        const out = base64js.fromByteArray(u8);
        return encoding === 'base64url'
          ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          : out;
      }
      return origToString.call(this, encoding as any, start as any, end as any);
    };
    const origFrom = CB.from;
    CB.from = function patchedFrom(value: any, enc?: any, length?: any) {
      if (typeof value === 'string' && (enc === 'base64' || enc === 'base64url')) {
        let s = value as string;
        if (enc === 'base64url') {
          s = s.replace(/-/g, '+').replace(/_/g, '/');
          while (s.length % 4) s += '=';
        }
        const u8 = base64js.toByteArray(s);
        return CB.from(u8.buffer, u8.byteOffset, u8.byteLength);
      }
      return origFrom.call(this, value, enc, length);
    };
  }
} catch {
  /* craftzdog not installed in this environment; nothing to patch */
}
