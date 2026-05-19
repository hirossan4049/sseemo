declare module 'argon2-browser' {
  export const ArgonType: { Argon2d: 0; Argon2i: 1; Argon2id: 2 };
  export interface HashOptions {
    pass: string;
    salt: Uint8Array;
    type?: number;
    time?: number;
    mem?: number;
    parallelism?: number;
    hashLen?: number;
  }
  export interface HashResult {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }
  export function hash(opts: HashOptions): Promise<HashResult>;
  const argon2: { hash: typeof hash; ArgonType: typeof ArgonType };
  export default argon2;
}
