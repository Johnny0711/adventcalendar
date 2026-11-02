import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config, released } from '../server/config.js';
import { database, hash, secret } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { initialize, generateQR } from '../scripts/manage.js';
import { contentSchema } from '../server/content.js';
describe('capability authentication and private resources', () => {
  let root: string,
    db: ReturnType<typeof database>,
    app: Awaited<ReturnType<typeof buildApp>>,
    tokens: Record<string, string>;
  let clock = Date.parse('2026-12-10T12:00:00Z');
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'advent-'));
    clock = Date.parse('2026-12-10T12:00:00Z');
    const c = config({
      NODE_ENV: 'test',
      DATA_DIR: root,
      CONTENT_DIR: path.join(root, 'content'),
      MEDIA_DIR: path.join(root, 'media'),
      OUTPUT_DIR: path.join(root, 'output'),
      DATE_LOCK: 'false',
    });
    db = database(c.data);
    tokens = await initialize(db, c.output);
    await mkdir(c.content, { recursive: true });
    await mkdir(path.join(c.media, '01'), { recursive: true });
    await writeFile(
      path.join(c.content, '01.json'),
      JSON.stringify({
        day: 1,
        title: 'Private title',
        blocks: [{ type: 'image', src: 'photo.webp', alt: 'A memory' }],
      }),
    );
    await writeFile(path.join(c.media, '01', 'photo.webp'), 'private-media');
    app = await buildApp(c, db, () => clock);
  });
  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  const cookie = (r: { headers: Record<string, unknown> }) =>
    String(r.headers['set-cookie']).split(';')[0];
  async function scan(d = 1, session?: string) {
    return app.inject({
      url: `/open/${String(d).padStart(2, '0')}/${tokens[d]}`,
      headers: session ? { cookie: session } : {},
    });
  }
  it('valid QR redirects without rendering secrets, creates an opaque HTTP-only cookie', async () => {
    const r = await scan();
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toBe('/day/1');
    expect(r.body).not.toContain(tokens[1]);
    expect(r.headers['set-cookie']).toContain('HttpOnly');
    expect(r.headers['set-cookie']).toContain('SameSite=Lax');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    const content = await app.inject({
      url: '/api/days/1',
      headers: { cookie: cookie(r) },
    });
    expect(content.statusCode).toBe(200);
    expect(content.body).toContain('Private title');
    expect(content.body).not.toContain('token_hash');
  });
  it('rejects invalid tokens, wrong-day tokens and malformed inputs', async () => {
    for (const url of [
      `/open/01/${secret()}`,
      `/open/02/${tokens[1]}`,
      '/open/25/invalid',
      '/open/01/invalid',
    ]) {
      const r = await app.inject({ url });
      expect(r.headers.location).toBe('/invalid');
      expect(r.headers['set-cookie']).toBeUndefined();
    }
  });
  it('supports reusable tokens and separate devices', async () => {
    const a = await scan(),
      b = await scan();
    expect(cookie(a)).not.toBe(cookie(b));
    for (const r of [a, b])
      expect(
        (
          await app.inject({
            url: '/api/days/1',
            headers: { cookie: cookie(r) },
          })
        ).statusCode,
      ).toBe(200);
  });
  it('accumulates unlocked days and rotates the session to prevent fixation', async () => {
    const a = await scan(),
      b = await scan(2, cookie(a));
    expect(cookie(a)).not.toBe(cookie(b));
    const r = await app.inject({
      url: '/api/unlocked',
      headers: { cookie: cookie(b) },
    });
    expect(r.json().days.map((d: { day: number }) => d.day)).toEqual([1, 2]);
    expect(
      (await app.inject({ url: '/api/days/1', headers: { cookie: cookie(a) } }))
        .statusCode,
    ).toBe(401);
  });
  it('revoked keys reject QR scans and existing session authorization', async () => {
    const a = await scan();
    db.prepare('UPDATE days SET enabled=0 WHERE day=1').run();
    expect((await scan()).headers.location).toBe('/invalid');
    expect(
      (await app.inject({ url: '/api/days/1', headers: { cookie: cookie(a) } }))
        .statusCode,
    ).toBe(401);
  });
  it('denies anonymous content, media, and direct navigation data', async () => {
    expect((await app.inject('/api/days/1')).statusCode).toBe(401);
    expect((await app.inject('/api/media/1/photo.webp')).statusCode).toBe(401);
    const page = await app.inject('/day/1');
    expect(page.body).not.toContain('Private title');
    expect(page.body).not.toContain('private-media');
    const a = await scan();
    expect(
      (
        await app.inject({
          url: '/api/days/10',
          headers: { cookie: cookie(a) },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rejects expired and fabricated sessions', async () => {
    const a = await scan();
    clock = Date.parse('2027-02-02T00:00:00Z');
    expect(
      (await app.inject({ url: '/api/days/1', headers: { cookie: cookie(a) } }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: '/api/days/1',
          headers: { cookie: `advent=${secret()}` },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('serves authorized media with ranges and forbids unreferenced files', async () => {
    const a = await scan(),
      headers = { cookie: cookie(a) };
    const r = await app.inject({ url: '/api/media/1/photo.webp', headers });
    expect(r.body).toBe('private-media');
    expect(r.headers['cache-control']).toBe('no-store');
    const partial = await app.inject({
      url: '/api/media/1/photo.webp',
      headers: { ...headers, range: 'bytes=0-6' },
    });
    expect(partial.statusCode).toBe(206);
    expect(partial.body).toBe('private');
    expect(
      (await app.inject({ url: '/api/media/1/other.webp', headers }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: '/api/media/1/photo.webp',
          headers: { ...headers, range: 'bytes=999-' },
        })
      ).statusCode,
    ).toBe(416);
  });
  it('rejects traversal and never serves private directories statically', async () => {
    for (const url of [
      '/api/media/1/%2e%2e%2fsecret.webp',
      '/api/media/1/%5csecret.webp',
      '/private/content/01.json',
      '/generated-private/qr-links.json',
      '/data/advent.sqlite',
      '/content-examples/01.json',
    ]) {
      const r = await app.inject(url);
      expect(r.statusCode).toBeGreaterThanOrEqual(400);
      expect(r.body).not.toContain('Private title');
      expect(r.body).not.toContain(tokens[1]);
    }
  });
  it('uses unique 256-bit tokens and stores only hashes in SQLite', () => {
    expect(new Set(Object.values(tokens)).size).toBe(24);
    for (const token of Object.values(tokens))
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      db.prepare('SELECT token_hash FROM days WHERE day=1').get()?.token_hash,
    ).toBe(hash(tokens[1]));
  });
  it('sets production cookies, CSP and HSTS without publishing credential files', async () => {
    await app.close();
    db = database(root);
    const c = config({
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://advent.example.com',
      DATA_DIR: root,
      CONTENT_DIR: path.join(root, 'content'),
      MEDIA_DIR: path.join(root, 'media'),
    });
    app = await buildApp(c, db, () => clock);
    const r = await scan();
    expect(r.headers['set-cookie']).toContain('__Host-advent=');
    expect(r.headers['set-cookie']).toContain('Secure');
    expect(r.headers['strict-transport-security']).toContain(
      'max-age=31536000',
    );
    expect(r.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
  });
  it('serves only built public assets with immutable caching and keeps the shell private-data-free', async ({
    skip,
  }) => {
    const assetDir = path.resolve('dist/client/assets');
    let assets: string[];
    try {
      assets = await readdir(assetDir);
    } catch {
      return skip('Run npm run build to exercise production assets');
    }
    const r = await app.inject(
      `/assets/${assets.find((a) => a.endsWith('.js'))}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toContain('immutable');
    expect(r.body).not.toContain(tokens[1]);
    expect(r.body).not.toContain('Private title');
    const home = await app.inject('/');
    expect(home.statusCode).toBe(200);
    expect(home.headers['cache-control']).toBe('no-store');
    expect(home.body).not.toContain('Private title');
  });
  it('initialization is idempotent, does not overwrite revoked keys', async () => {
    const before = db.prepare('SELECT * FROM days').all();
    await initialize(db, path.join(root, 'output'));
    expect(db.prepare('SELECT * FROM days').all()).toEqual(before);
    db.prepare('UPDATE days SET enabled=0 WHERE day=1').run();
    await initialize(db, path.join(root, 'output'));
    expect(
      db.prepare('SELECT enabled FROM days WHERE day=1').get()?.enabled,
    ).toBe(0);
  });
  it('generates SVG, PNG, links and a numbered printable sheet locally', async () => {
    await generateQR(
      db,
      path.join(root, 'output'),
      'https://advent.example.com',
    );
    expect(
      await readFile(path.join(root, 'output/qr/day-01.svg'), 'utf8'),
    ).toContain('December 01');
    expect(
      (await readFile(path.join(root, 'output/qr/day-24.png')))
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
    expect(
      await readFile(path.join(root, 'output/printable/index.html'), 'utf8'),
    ).toContain('A4');
  });
  it('rate-limits token guessing without echoing the URL', async () => {
    let r;
    for (let i = 0; i < 31; i++) r = await app.inject(`/open/01/${secret()}`);
    expect(r?.statusCode).toBe(429);
    expect(r?.body).not.toContain('/open');
  });
  it('blocks early content and media even after a valid scan', async () => {
    await app.close();
    db = database(root);
    const c = config({
      NODE_ENV: 'test',
      DATA_DIR: root,
      CONTENT_DIR: path.join(root, 'content'),
      MEDIA_DIR: path.join(root, 'media'),
      DATE_LOCK: 'true',
    });
    clock = Date.parse('2026-11-30T21:59:59Z');
    app = await buildApp(c, db, () => clock);
    const a = await scan(),
      headers = { cookie: cookie(a) };
    expect((await app.inject({ url: '/api/days/1', headers })).statusCode).toBe(
      423,
    );
    expect(
      (await app.inject({ url: '/api/media/1/photo.webp', headers }))
        .statusCode,
    ).toBe(423);
    clock += 1000;
    expect((await app.inject({ url: '/api/days/1', headers })).statusCode).toBe(
      200,
    );
  });
  it('prevents symlinks escaping private storage', async ({ skip }) => {
    await writeFile(path.join(root, 'outside.webp'), 'outside');
    try {
      await symlink(
        path.join(root, 'outside.webp'),
        path.join(root, 'media/01/link.webp'),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EPERM')
        return skip('OS does not permit symlink creation');
      throw e;
    }
    await writeFile(
      path.join(root, 'content/01.json'),
      JSON.stringify({
        day: 1,
        title: 'Test',
        blocks: [{ type: 'image', src: 'link.webp', alt: 'test' }],
      }),
    );
    const a = await scan();
    expect(
      (
        await app.inject({
          url: '/api/media/1/link.webp',
          headers: { cookie: cookie(a) },
        })
      ).statusCode,
    ).toBe(404);
  });
});
describe('configuration and content validation', () => {
  it('uses calendar timezone boundaries, year and past-day semantics', () => {
    const c = config({ DATE_LOCK: 'true' });
    expect(released(1, c, Date.parse('2026-11-30T21:59:59Z'))).toBe(false);
    expect(released(1, c, Date.parse('2026-11-30T22:00:00Z'))).toBe(true);
    expect(released(24, c, Date.parse('2027-01-01T00:00:00Z'))).toBe(true);
    expect(released(1, c, Date.parse('2025-12-24T00:00:00Z'))).toBe(false);
  });
  it('rejects unsafe production and malformed configuration', () => {
    expect(() => config({ NODE_ENV: 'production' })).toThrow();
    expect(() => config({ TIMEZONE: 'Invalid/Zone' })).toThrow();
    expect(() => config({ DATE_LOCK: 'yes' })).toThrow();
  });
  it('validates media paths and quiz answer indices', () => {
    expect(
      contentSchema.safeParse({
        day: 1,
        title: 'Test',
        blocks: [{ type: 'image', src: '../secret.webp', alt: 'test' }],
      }).success,
    ).toBe(false);
    expect(
      contentSchema.safeParse({
        day: 1,
        title: 'Test',
        blocks: [
          {
            type: 'quiz',
            question: 'Q',
            options: ['a', 'b'],
            answer: 2,
            explanation: 'x',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
