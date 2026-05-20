import { describe, it, expect } from 'vitest';
import { signSessionJWT, verifySessionJWT } from '../src/jwt';

describe('session jwt', () => {
  it('round-trips a payload', async () => {
    const t = await signSessionJWT({ sub: 'u1', email: 'a@b' }, 'sekret', 60);
    const p = await verifySessionJWT(t, 'sekret');
    expect(p.sub).toBe('u1');
    expect(p.email).toBe('a@b');
    expect(typeof p.iat).toBe('number');
    expect(typeof p.exp).toBe('number');
  });

  it('rejects a bad signature', async () => {
    const t = await signSessionJWT({ sub: 'u1' }, 'sekret', 60);
    await expect(verifySessionJWT(t, 'wrong')).rejects.toThrow();
  });

  it('rejects expired tokens', async () => {
    const t = await signSessionJWT({ sub: 'u1' }, 'sekret', -1);
    await expect(verifySessionJWT(t, 'sekret')).rejects.toThrow(/expired/);
  });

  it('rejects malformed tokens', async () => {
    await expect(verifySessionJWT('not.a.jwt', 'sekret')).rejects.toThrow();
  });
});
