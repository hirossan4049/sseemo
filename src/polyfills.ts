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
if (typeof g.Buffer === 'undefined') g.Buffer = BufferPolyfill;
