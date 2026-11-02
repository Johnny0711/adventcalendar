import path from 'node:path';
import { z } from 'zod';
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
export function config(env: NodeJS.ProcessEnv = process.env) {
  const e = z
    .object({
      NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
      PUBLIC_ORIGIN: z.url().default('http://localhost:5173'),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      CALENDAR_YEAR: z.coerce.number().int().min(2020).max(9998).default(2026),
      TIMEZONE: z.string().default('Europe/Bucharest'),
      DATE_LOCK: bool.default(false),
      SESSION_EXPIRES_AT: z.iso.datetime().optional(),
      DATA_DIR: z.string().default('./data'),
      CONTENT_DIR: z.string().default('./private/content'),
      MEDIA_DIR: z.string().default('./private/media'),
      OUTPUT_DIR: z.string().default('./generated-private'),
      TRUST_PROXY: z.string().default(''),
    })
    .parse(env);
  new Intl.DateTimeFormat('en', { timeZone: e.TIMEZONE }).format();
  const origin = new URL(e.PUBLIC_ORIGIN);
  if (origin.origin !== e.PUBLIC_ORIGIN || origin.username || origin.password)
    throw Error('PUBLIC_ORIGIN must be an origin without path or credentials');
  if (e.NODE_ENV === 'production' && origin.protocol !== 'https:')
    throw Error('Production requires an HTTPS PUBLIC_ORIGIN');
  const expires = Date.parse(
    e.SESSION_EXPIRES_AT ?? `${e.CALENDAR_YEAR + 1}-02-01T00:00:00Z`,
  );
  if (!Number.isFinite(expires)) throw Error('Invalid session expiration');
  return {
    ...e,
    expires,
    secure: e.NODE_ENV === 'production',
    data: path.resolve(e.DATA_DIR),
    content: path.resolve(e.CONTENT_DIR),
    media: path.resolve(e.MEDIA_DIR),
    output: path.resolve(e.OUTPUT_DIR),
  };
}
export type Config = ReturnType<typeof config>;
export function released(day: number, c: Config, now: number) {
  if (!c.DATE_LOCK) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: c.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const p = (type: string) => Number(parts.find((v) => v.type === type)?.value);
  return (
    p('year') * 10000 + p('month') * 100 + p('day') >=
    c.CALENDAR_YEAR * 10000 + 1200 + day
  );
}
