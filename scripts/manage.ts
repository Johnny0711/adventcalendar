import { mkdir, readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { backup } from 'node:sqlite';
import { config } from '../server/config.js';
import { database, hash, secret, type DB } from '../server/db.js';
async function writeVault(file: string, tokens: Record<string, string>) {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  await rename(tmp, file);
}
export async function initialize(db: DB, output: string) {
  await mkdir(output, { recursive: true, mode: 0o700 });
  const vault = path.join(output, 'token-vault.json');
  const tokens: Record<string, string> = existsSync(vault)
    ? JSON.parse(await readFile(vault, 'utf8'))
    : {};
  // Persist recovery secrets BEFORE database writes: interrupted initialization is recoverable.
  for (let d = 1; d <= 24; d++)
    if (!db.prepare('SELECT 1 FROM days WHERE day=?').get(d) && !tokens[d])
      tokens[d] = secret();
  await writeVault(vault, tokens);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO days(day,token_hash,created_at) VALUES(?,?,?)',
  );
  for (let d = 1; d <= 24; d++)
    if (tokens[d]) insert.run(d, hash(tokens[d]), Date.now());
  return tokens;
}
export async function generateQR(
  db: DB,
  output: string,
  origin: string,
  size = 30,
  ecc: 'L' | 'M' | 'Q' | 'H' = 'M',
) {
  if (!Number.isFinite(size) || size < 20 || size > 45)
    throw Error('QR_MM must be 20–45 for the A4 sheet');
  if (!['L', 'M', 'Q', 'H'].includes(ecc)) throw Error('Invalid QR_ECC');
  const tokens = await initialize(db, output);
  const links: Record<string, string> = {};
  await mkdir(path.join(output, 'qr'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(output, 'printable'), { recursive: true, mode: 0o700 });
  for (let d = 1; d <= 24; d++) {
    const row = db
      .prepare('SELECT token_hash,enabled FROM days WHERE day=?')
      .get(d);
    if (!tokens[d] || row?.token_hash !== hash(tokens[d]) || !row.enabled)
      throw Error(
        `Day ${d}: missing recovery token or revoked. Restore the vault or rotate explicitly.`,
      );
    const day = String(d).padStart(2, '0'),
      url = `${origin}/open/${day}/${tokens[d]}`;
    links[day] = url;
    const svg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: ecc,
      margin: 4,
    });
    // Add a separate day label below the matrix, preserving all quiet zones.
    const view = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;
    const w = Number(view[1]),
      h = Number(view[2]);
    const labeled = svg
      .replace(
        /viewBox="[^"]+"/,
        `width="${size}mm" height="${(size * (h + 9)) / h}mm" viewBox="0 0 ${w} ${h + 9}"`,
      )
      .replace(
        '</svg>',
        `<text x="${w / 2}" y="${h + 6}" text-anchor="middle" font-family="sans-serif" font-size="5" fill="black">December ${day}</text></svg>`,
      );
    await writeFile(path.join(output, 'qr', `day-${day}.svg`), labeled, {
      mode: 0o600,
    });
    await QRCode.toFile(path.join(output, 'qr', `day-${day}.png`), url, {
      width: 900,
      margin: 4,
      errorCorrectionLevel: ecc,
    });
  }
  await writeFile(
    path.join(output, 'qr-links.json'),
    JSON.stringify(links, null, 2),
    { mode: 0o600 },
  );
  const cards = Object.keys(links)
    .sort((a, b) => Number(a) - Number(b))
    .map(
      (d) =>
        `<figure><img src="../qr/day-${d}.svg" alt="December ${d}"></figure>`,
    )
    .join('');
  await writeFile(
    path.join(output, 'printable', 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Private Advent QR codes — keep safe</title><style>@page{size:A4;margin:10mm}body{margin:0;font-family:sans-serif}.sheet{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm}figure{margin:0;padding:2mm;border:0.2mm dashed #aaa;display:flex;justify-content:center;break-inside:avoid}img{width:${size}mm;height:auto}@media screen{body{max-width:190mm;margin:20px auto}} </style><main class="sheet">${cards}</main></html>`,
    { mode: 0o600 },
  );
}
async function main() {
  process.umask(0o077);
  const c = config(),
    db = database(c.data),
    cmd = process.argv[2];
  try {
    if (cmd === 'init') {
      await initialize(db, c.output);
      await mkdir(c.content, { recursive: true, mode: 0o700 });
      for (let d = 1; d <= 24; d++) {
        const day = String(d).padStart(2, '0');
        await mkdir(path.join(c.media, day), { recursive: true, mode: 0o700 });
        const target = path.join(c.content, `${day}.json`);
        if (!existsSync(target))
          await copyFile(
            path.resolve('content-examples', `${day}.json`),
            target,
          );
      }
    } else if (cmd === 'qr')
      await generateQR(
        db,
        c.output,
        c.PUBLIC_ORIGIN,
        Number(process.env.QR_MM ?? 30),
        (process.env.QR_ECC ?? 'M') as 'M',
      );
    else if (cmd === 'rotate' || cmd === 'revoke') {
      const d = Number(process.argv[3]);
      if (
        !Number.isInteger(d) ||
        d < 1 ||
        d > 24 ||
        process.argv[4] !== '--confirm'
      )
        throw Error(
          'Usage: npm run key:rotate -- DAY --confirm (or key:revoke). Existing access for this day is removed.',
        );
      if (cmd === 'rotate') {
        const tokens = await initialize(db, c.output),
          token = secret();
        tokens[d] = token;
        await writeVault(path.join(c.output, 'token-vault.json'), tokens);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('UPDATE days SET token_hash=?,enabled=1 WHERE day=?').run(
            hash(token),
            d,
          );
          db.prepare('DELETE FROM session_unlocks WHERE day=?').run(d);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      } else {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('UPDATE days SET enabled=0 WHERE day=?').run(d);
          db.prepare('DELETE FROM session_unlocks WHERE day=?').run(d);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      }
    } else if (cmd === 'backup') {
      await mkdir('backups', { recursive: true, mode: 0o700 });
      await backup(db, path.resolve('backups', `advent-${Date.now()}.sqlite`));
    } else throw Error('Unknown management command');
    console.info(
      'Completed. Private artifacts stay in the configured private directories.',
    );
  } finally {
    db.close();
  }
}
if (process.argv[1] && /manage\.(ts|js)$/.test(process.argv[1])) await main();
