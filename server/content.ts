import { z } from 'zod';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
export const filename = z
  .string()
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.(webp|png|jpg|jpeg|gif|mp4|webm|mp3|m4a|ogg|wav|pdf)$/,
  );
const text = z.string().min(1).max(30000);
export const contentSchema = z
  .object({
    day: z.number().int().min(1).max(24),
    title: z.string().min(1).max(200),
    blocks: z
      .array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('text'), content: text }).strict(),
          z.object({ type: z.literal('letter'), content: text }).strict(),
          z
            .object({
              type: z.literal('image'),
              src: filename,
              alt: z.string().min(1).max(500),
            })
            .strict(),
          z
            .object({
              type: z.literal('video'),
              src: filename,
              caption: z.string().max(500).optional(),
            })
            .strict(),
          z
            .object({
              type: z.literal('audio'),
              src: filename,
              caption: z.string().max(500).optional(),
            })
            .strict(),
          z
            .object({
              type: z.literal('file'),
              src: filename,
              label: z.string().min(1).max(200),
            })
            .strict(),
          z
            .object({
              type: z.literal('quiz'),
              question: text,
              options: z.array(z.string().min(1).max(500)).min(2).max(8),
              answer: z.number().int().min(0),
              explanation: text,
            })
            .strict()
            .refine((v) => v.answer < v.options.length),
        ]),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type DayContent = z.infer<typeof contentSchema>;
export async function safeFile(root: string, segments: string[]) {
  const base = await realpath(root);
  const file = await realpath(path.join(base, ...segments));
  if (!file.startsWith(base + path.sep)) throw Error('Unsafe path');
  return file;
}
export async function loadContent(root: string, day: number) {
  const file = await safeFile(root, [`${String(day).padStart(2, '0')}.json`]);
  const result = contentSchema.parse(
    JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')),
  );
  if (result.day !== day) throw Error('Content day mismatch');
  return result;
}
