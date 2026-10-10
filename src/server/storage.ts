// Replay storage: a private Cloudflare R2 bucket, spoken to over its S3 API
// with SigV4 from aws4fetch (no AWS SDK). Server only — holds the R2 keys.
//
// Nothing large ever passes through a Vercel function: the mod PUTs to a
// presigned URL and downloads redirect to one. The function only signs,
// checks an object's size, and deletes.
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.

import { AwsClient } from 'aws4fetch';

const TIMEOUT_MS = 8000;

interface R2 {
  client: AwsClient;
  base: string; // https://<account>.r2.cloudflarestorage.com/<bucket>
}

let r2: R2 | null = null;

export function storageConfigured(): boolean {
  const e = process.env;
  return !!(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET);
}

function client(): R2 {
  if (r2) return r2;
  if (!storageConfigured()) throw new Error('R2 storage is not configured (R2_* env vars)');
  const e = process.env;
  r2 = {
    client: new AwsClient({
      accessKeyId: e.R2_ACCESS_KEY_ID!,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY!,
      service: 's3',
      region: 'auto',
    }),
    base: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${e.R2_BUCKET}`,
  };
  return r2;
}

const objectUrl = (key: string) => `${client().base}/${key.split('/').map(encodeURIComponent).join('/')}`;

// A URL anyone holding it can use for `method` on `key` until it expires.
// Extra query parameters (response-content-disposition) are signed too.
export async function presign(
  method: 'PUT' | 'GET',
  key: string,
  expiresS: number,
  query: Record<string, string> = {},
): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(expiresS));
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const signed = await client().client.sign(url.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

// The stored object's size, or null when there is none.
export async function objectSize(key: string): Promise<number | null> {
  const res = await client().client.fetch(objectUrl(key), {
    method: 'HEAD',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${key}: ${res.status}`);
  return Number(res.headers.get('content-length') ?? 0);
}

// A small object written by the server itself: a live replay chunk, which is
// capped well under a function's body limit. Overwriting is fine (a retry of
// the same chunk carries the same bytes).
export async function putObject(key: string, body: Uint8Array<ArrayBuffer>): Promise<void> {
  const res = await client().client.fetch(objectUrl(key), {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'application/octet-stream' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`R2 PUT ${key}: ${res.status}`);
}

// Deleting a missing object succeeds (S3 semantics), so this is idempotent.
export async function deleteObject(key: string): Promise<void> {
  const res = await client().client.fetch(objectUrl(key), {
    method: 'DELETE',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key}: ${res.status}`);
}

// A browser download that saves under `fileName` (the game's own naming, so
// it can go straight into the replay folder).
export const downloadUrl = (key: string, fileName: string, expiresS: number) =>
  presign('GET', key, expiresS, {
    'response-content-disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
    'response-content-type': 'application/octet-stream',
  });
