import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import { config, released, type Config } from './config.js';
import { database, hash, secret, type DB } from './db.js';
import { filename, loadContent, safeFile } from './content.js';
const validSecret = /^[A-Za-z0-9_-]{43}$/;
const dayNumber = (s: string) =>
  /^(0?[1-9]|1[0-9]|2[0-4])$/.test(s) ? Number(s) : 0;
export async function buildApp(
  c: Config = config(),
  db: DB = database(c.data),
  now = () => Date.now(),
) {
  const app = Fastify({
    logger: false,
    trustProxy: c.TRUST_PROXY ? c.TRUST_PROXY.split(',') : false,
    bodyLimit: 16384,
    routerOptions: { maxParamLength: 100 },
  });
  const cookieName = c.secure ? '__Host-advent' : 'advent';
  await app.register(cookie);
  await app.register(helmet, {
    hsts: c.secure ? { maxAge: 31536000 } : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        mediaSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
        upgradeInsecureRequests: c.secure ? [] : null,
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(rateLimit, {
    global: false,
    max: 30,
    timeWindow: '1 minute',
  });
  app.addHook('onRequest', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, _req, reply) => {
    const code =
      error instanceof Error && 'statusCode' in error ? error.statusCode : 500;
    const status = code === 429 ? 429 : code === 400 ? 400 : 500;
    reply.code(status).send({
      error:
        status === 429
          ? 'Too many scans. Please wait a minute.'
          : status === 400
            ? 'Invalid request.'
            : 'Something went wrong. Please try again.',
    });
  });
  const session = (req: FastifyRequest) => {
    const raw = req.cookies[cookieName];
    if (!raw || !validSecret.test(raw)) return undefined;
    const id = hash(raw);
    return db
      .prepare('SELECT id_hash FROM sessions WHERE id_hash=? AND expires_at>?')
      .get(id, now())
      ? id
      : undefined;
  };
  const authorized = (req: FastifyRequest, day: number) => {
    const id = session(req);
    return (
      !!id &&
      !!db
        .prepare(
          'SELECT 1 FROM session_unlocks u JOIN days d ON d.day=u.day WHERE u.session_hash=? AND u.day=? AND d.enabled=1',
        )
        .get(id, day)
    );
  };
  app.get('/health', async () => {
    db.prepare('SELECT 1').get();
    return { status: 'ok' };
  });
  app.get<{ Params: { day: string; token: string } }>(
    '/open/:day/:token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const day = dayNumber(req.params.day),
        token = req.params.token;
      const row =
        day && validSecret.test(token)
          ? db
              .prepare('SELECT token_hash FROM days WHERE day=? AND enabled=1')
              .get(day)
          : undefined;
      if (
        !row ||
        !timingSafeEqual(
          Buffer.from(String(row.token_hash), 'hex'),
          Buffer.from(hash(token), 'hex'),
        )
      )
        return reply.code(303).redirect('/invalid');
      if (c.expires <= now())
        return reply
          .code(503)
          .send({ error: 'The calendar session season has ended.' });
      const old = session(req),
        raw = secret(),
        id = hash(raw),
        time = now();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
          id,
          time,
          c.expires,
        );
        if (old)
          db.prepare(
            'INSERT INTO session_unlocks SELECT ?,day,unlocked_at FROM session_unlocks WHERE session_hash=?',
          ).run(id, old);
        db.prepare('INSERT OR IGNORE INTO session_unlocks VALUES(?,?,?)').run(
          id,
          day,
          time,
        );
        if (old) db.prepare('DELETE FROM sessions WHERE id_hash=?').run(old);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      reply.setCookie(cookieName, raw, {
        httpOnly: true,
        secure: c.secure,
        sameSite: 'lax',
        path: '/',
        expires: new Date(c.expires),
      });
      return reply.code(303).redirect(`/day/${day}`);
    },
  );
  app.get('/api/unlocked', async (req) => {
    const id = session(req);
    const rows = id
      ? db
          .prepare(
            'SELECT u.day FROM session_unlocks u JOIN days d ON d.day=u.day WHERE session_hash=? AND enabled=1',
          )
          .all(id)
      : [];
    return {
      year: c.CALENDAR_YEAR,
      days: rows.map((r) => ({
        day: Number(r.day),
        available: released(Number(r.day), c, now()),
      })),
    };
  });
  app.get<{ Params: { day: string } }>('/api/days/:day', async (req, reply) => {
    const day = dayNumber(req.params.day);
    if (!day) return reply.code(400).send({ error: 'Invalid day' });
    if (!authorized(req, day))
      return reply
        .code(401)
        .send({ error: 'Scan this day’s QR code to open it.' });
    if (!released(day, c, now()))
      return reply.code(423).send({
        error: 'A little patience. This surprise opens in December.',
        day,
        year: c.CALENDAR_YEAR,
      });
    return loadContent(c.content, day);
  });
  const mime: Record<string, string> = {
    webp: 'image/webp',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    pdf: 'application/pdf',
  };
  app.get<{ Params: { day: string; filename: string } }>(
    '/api/media/:day/:filename',
    async (req, reply) => {
      const day = dayNumber(req.params.day),
        name = req.params.filename;
      if (!day || !filename.safeParse(name).success)
        return reply.code(400).send({ error: 'Invalid media path' });
      if (!authorized(req, day))
        return reply
          .code(401)
          .send({ error: 'Scan this day’s QR code to open it.' });
      if (!released(day, c, now()))
        return reply.code(423).send({ error: 'Not yet' });
      const content = await loadContent(c.content, day);
      if (!content.blocks.some((b) => 'src' in b && b.src === name))
        return reply.code(404).send({ error: 'Media not found' });
      let file;
      try {
        file = await safeFile(c.media, [String(day).padStart(2, '0'), name]);
      } catch {
        return reply.code(404).send({ error: 'Media not found' });
      }
      const info = await stat(file);
      if (!info.isFile())
        return reply.code(404).send({ error: 'Media not found' });
      reply.type(mime[name.split('.').pop()!]).header('Accept-Ranges', 'bytes');
      if (name.endsWith('.pdf'))
        reply.header('Content-Disposition', `attachment; filename="${name}"`);
      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = m?.[1] ? Number(m[1]) : 0,
          end = m?.[2] ? Number(m[2]) : info.size - 1;
        if (m && !m[1] && m[2]) {
          start = Math.max(0, info.size - Number(m[2]));
          end = info.size - 1;
        }
        if (
          !m ||
          (!m[1] && !m[2]) ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= info.size
        )
          return reply
            .code(416)
            .header('Content-Range', `bytes */${info.size}`)
            .send();
        end = Math.min(end, info.size - 1);
        return reply
          .code(206)
          .header('Content-Range', `bytes ${start}-${end}/${info.size}`)
          .header('Content-Length', end - start + 1)
          .send(createReadStream(file, { start, end }));
      }
      return reply
        .header('Content-Length', info.size)
        .send(createReadStream(file));
    },
  );
  const publicRoot = path.resolve('dist/client');
  if (existsSync(publicRoot))
    await app.register(staticFiles, {
      root: path.join(publicRoot, 'assets'),
      prefix: '/assets/',
      immutable: true,
      maxAge: '1y',
      setHeaders(reply) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
  app.setNotFoundHandler(async (req, reply) => {
    if (
      req.method === 'GET' &&
      existsSync(path.join(publicRoot, 'index.html')) &&
      /^\/$|^\/day\/[^/]+$|^\/invalid$/.test(req.url.split('?')[0])
    )
      return reply
        .type('text/html')
        .send(createReadStream(path.join(publicRoot, 'index.html')));
    if (
      req.method === 'GET' &&
      !/^\/(api|open|assets|private|generated-private|data)(\/|$)/.test(
        req.url,
      ) &&
      existsSync(path.join(publicRoot, 'index.html'))
    )
      return reply
        .code(404)
        .type('text/html')
        .send(createReadStream(path.join(publicRoot, 'index.html')));
    return reply.code(404).send({ error: 'Not found' });
  });
  const cleanup = setInterval(
    () => db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now()),
    3600000,
  );
  cleanup.unref();
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    db.close();
  });
  return app;
}
