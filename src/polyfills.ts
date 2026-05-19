/**
 * RN ランタイムで Buffer / global crypto を有効化。
 * index.js の最上段で読み込まれる。
 */
import { install } from 'react-native-quick-crypto';
import { Buffer as BufferPolyfill } from 'buffer';

install();
// @ts-ignore
if (typeof global.Buffer === 'undefined') global.Buffer = BufferPolyfill;
