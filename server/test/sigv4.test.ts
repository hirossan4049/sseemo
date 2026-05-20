import { describe, it, expect } from 'vitest';
import { presign } from '../src/sigv4';

describe('sigv4 presign', () => {
  it('produces a URL with the expected SigV4 query params', async () => {
    const url = await presign({
      method: 'PUT',
      endpoint: 'https://abc123.r2.cloudflarestorage.com',
      path: '/my-bucket/users/u1/file.bin',
      region: 'auto',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'SECRETEXAMPLE',
      expiresSec: 900,
      nowMs: Date.UTC(2024, 0, 2, 3, 4, 5),
    });
    const u = new URL(url);
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-Date')).toBe('20240102T030405Z');
    expect(u.searchParams.get('X-Amz-Credential')).toContain('AKIDEXAMPLE/20240102/auto/s3/');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(u.pathname).toBe('/my-bucket/users/u1/file.bin');
  });

  it('is deterministic for the same inputs', async () => {
    const args = {
      method: 'GET' as const,
      endpoint: 'https://abc.r2.cloudflarestorage.com',
      path: '/b/k',
      region: 'auto',
      accessKeyId: 'A',
      secretAccessKey: 'S',
      expiresSec: 60,
      nowMs: 1700000000000,
    };
    const a = await presign(args);
    const b = await presign(args);
    expect(a).toBe(b);
  });

  it('includes extra query params in the canonical request', async () => {
    const url = await presign({
      method: 'PUT',
      endpoint: 'https://abc.r2.cloudflarestorage.com',
      path: '/b/k',
      region: 'auto',
      accessKeyId: 'A',
      secretAccessKey: 'S',
      expiresSec: 60,
      nowMs: 1700000000000,
      query: { partNumber: '1', uploadId: 'XYZ' },
    });
    const u = new URL(url);
    expect(u.searchParams.get('partNumber')).toBe('1');
    expect(u.searchParams.get('uploadId')).toBe('XYZ');
  });
});
