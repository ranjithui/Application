#!/usr/bin/env node
/**
 * Prepares a Supabase project for this app and proves the connection works
 * before you spend time on a Render deploy.
 *
 *   npm run supabase:init
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL from .env, so
 * the secrets stay in that file and are never printed or passed on a command
 * line. It is safe to run more than once.
 *
 * What it does:
 *   1. checks DATABASE_URL points at the Supabase *pooler* (Render cannot reach
 *      the direct db.<ref>.supabase.co host — that one is IPv6-only)
 *   2. opens a TLS connection to Postgres and reports the server version
 *   3. creates the private storage bucket if it is missing
 *   4. round-trips a small object through the bucket: upload, download, compare,
 *      delete
 */
import pg from 'pg';

const fail = (msg) => { console.error(`\n  FAIL  ${msg}\n`); process.exit(1); };
const ok = (msg) => console.log(`  ok    ${msg}`);
const warn = (msg) => console.log(`  warn  ${msg}`);

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documents';
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 10);

for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, DATABASE_URL })) {
  if (!value) fail(`${name} is not set in .env. See docs/DEPLOYMENT.md, Option C.`);
}

const headers = { authorization: `Bearer ${KEY}`, apikey: KEY };

/** fetch, but a DNS/TLS/network error reports the cause instead of a stack trace. */
async function api(url, init) {
  try {
    return await fetch(url, init);
  } catch (err) {
    fail(`Could not reach ${SUPABASE_URL}: ${err.cause?.message ?? err.message}\n` +
         '        Check SUPABASE_URL — it should look like https://<ref>.supabase.co');
  }
}

console.log(`\nSupabase project: ${SUPABASE_URL}\nBucket:           ${BUCKET}\n`);

// --- 1. connection string sanity ------------------------------------------
if (/db\.[a-z0-9]+\.supabase\.co/.test(DATABASE_URL)) {
  fail(
    'DATABASE_URL uses the direct Supabase host (db.<ref>.supabase.co), which is\n' +
    '        IPv6-only and unreachable from Render. Use the Session pooler URI from\n' +
    '        Project Settings -> Database -> Connection string -> Session pooler:\n' +
    '        postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres',
  );
}
if (DATABASE_URL.includes('pooler.supabase.com')) ok('DATABASE_URL uses the Supabase pooler');
else warn('DATABASE_URL does not look like a Supabase pooler URI — continuing anyway');

if (process.env.DATABASE_SSL === 'false' || !process.env.DATABASE_SSL) {
  warn("DATABASE_SSL is off. Supabase needs 'no-verify' (or 'true' with DATABASE_CA_CERT).");
}

// --- 2. database ------------------------------------------------------------
const sslMode = (process.env.DATABASE_SSL || '').toLowerCase();
const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: sslMode === 'false' || sslMode === '' ? undefined : { rejectUnauthorized: sslMode === 'true' },
  connectionTimeoutMillis: 15_000,
});
try {
  await client.connect();
} catch (err) {
  fail(`Could not connect to Postgres: ${err.message}`);
}
const { rows: [v] } = await client.query('SELECT version() AS v');
ok(`connected — ${v.v.split(' ').slice(0, 2).join(' ')}`);

const { rows: [m] } = await client.query(
  "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ready",
);
if (m.ready) {
  const { rows: [c] } = await client.query('SELECT count(*)::int AS n FROM schema_migrations');
  const { rows: [u] } = await client.query(
    "SELECT CASE WHEN to_regclass('public.users') IS NULL THEN -1 ELSE (SELECT count(*)::int FROM users) END AS n",
  );
  ok(`${c.n} migration(s) already applied, ${u.n < 0 ? 0 : u.n} user(s)`);
} else {
  warn('schema not created yet — run `npm run db:migrate` next');
}
await client.end();

// --- 3. bucket --------------------------------------------------------------
const head = await api(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers });
if (head.status === 404) {
  const res = await api(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      // Private: the API streams every download itself after checking
      // permissions, so objects must never be reachable by URL alone.
      public: false,
      file_size_limit: MAX_MB * 1024 * 1024,
      allowed_mime_types: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    }),
  });
  if (!res.ok) fail(`Could not create bucket: ${res.status} ${await res.text()}`);
  ok(`created private bucket "${BUCKET}"`);
} else if (head.ok) {
  const b = await head.json();
  ok(`bucket "${BUCKET}" exists`);
  if (b.public) fail(`Bucket "${BUCKET}" is PUBLIC. Student documents would be readable by anyone with the URL. Set it to private in the Supabase dashboard.`);
  ok('bucket is private');
} else {
  fail(`Could not read bucket: ${head.status} ${await head.text()}`);
}

// --- 4. storage round trip --------------------------------------------------
const key = `_healthcheck/${Date.now()}.pdf`;
const body = Buffer.from('%PDF-1.4\n% supabase-init round trip\n%%EOF\n');

const put = await api(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/pdf', 'x-upsert': 'true' },
  body: new Uint8Array(body),
});
if (!put.ok) fail(`Upload failed: ${put.status} ${await put.text()}`);
ok('upload');

const get = await api(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, { headers });
if (!get.ok) fail(`Download failed: ${get.status}`);
const back = Buffer.from(await get.arrayBuffer());
if (!back.equals(body)) fail('Downloaded bytes differ from what was uploaded');
ok('download — bytes identical');

const del = await api(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, { method: 'DELETE', headers });
if (!del.ok && del.status !== 404) warn(`Could not delete the test object (${del.status}); remove ${key} by hand`);
else ok('delete');

console.log(`
Supabase is ready.

Next:
  1. npm run db:migrate     (and npm run db:seed for the demo accounts)
  2. push to GitHub, then Render -> New -> Blueprint
`);
