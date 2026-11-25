import type { DayContent } from '../server/content';

export type CouponBlock = Extract<
  DayContent['blocks'][number],
  { type: 'coupon' }
>;

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function createVoucherImage(block: CouponBlock, url: string) {
  const photo = url ? new Image() : undefined;
  if (photo) {
    photo.src = url;
    await photo.decode();
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Could not create voucher image');

  const width = 900;
  const stub = 170;
  const padding = 32;
  const photoSize = 254;
  const textWidth = width - stub - 2 * padding - (photo ? photoSize + 24 : 0);
  const titleFont = '46px Georgia, serif';
  const bodyFont = '25px system-ui, sans-serif';
  ctx.font = titleFont;
  const title = wrapText(ctx, block.title, textWidth);
  ctx.font = bodyFont;
  const description = block.description
    ? wrapText(ctx, block.description, textWidth)
    : [];
  const textHeight =
    34 +
    title.length * 54 +
    (description.length ? 12 + description.length * 34 : 0);
  const height = Math.max(
    286,
    Math.max(textHeight, photo ? photoSize : 0) + 2 * padding,
  );
  canvas.width = width;
  canvas.height = height;

  const accent = block.color ?? '#d7ad75';
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 25);
  ctx.clip();
  ctx.fillStyle = '#302a28';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.37;
  ctx.fillRect(0, 0, stub, height);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#cdbba6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(stub / 2 - 43, height / 2 - 43, 86, 86, 22);
  ctx.stroke();
  ctx.fillStyle = '#efe2cf';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '36px system-ui, sans-serif';
  ctx.fillText(block.icon ?? '♡', stub / 2, height / 2, 68);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const textX = stub + padding;
  let y = Math.round((height - textHeight) / 2);
  ctx.fillStyle = '#cdbba6';
  ctx.font = '600 19px system-ui, sans-serif';
  ctx.fillText('GIFT VOUCHER', textX, y);
  y += 34;
  ctx.fillStyle = '#efe2cf';
  ctx.font = titleFont;
  for (const line of title) {
    ctx.fillText(line, textX, y);
    y += 54;
  }
  y += 12;
  ctx.fillStyle = '#cdbba6';
  ctx.font = bodyFont;
  for (const line of description) {
    ctx.fillText(line, textX, y);
    y += 34;
  }

  if (photo) {
    const side = Math.min(photo.naturalWidth, photo.naturalHeight);
    const x = width - padding - photoSize;
    const top = (height - photoSize) / 2;
    ctx.fillStyle = '#211e1c';
    ctx.strokeStyle = '#746256';
    ctx.beginPath();
    ctx.roundRect(x - 6, top - 6, photoSize + 12, photoSize + 12, 16);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, top, photoSize, photoSize, 10);
    ctx.clip();
    ctx.drawImage(
      photo,
      (photo.naturalWidth - side) / 2,
      (photo.naturalHeight - side) / 2,
      side,
      side,
      x,
      top,
      photoSize,
      photoSize,
    );
    ctx.restore();
  }

  ctx.strokeStyle = '#746256';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, width - 2, height - 2, 24);
  ctx.stroke();

  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(stub, 0);
  ctx.lineTo(stub, height);
  ctx.stroke();
  for (const edge of [0, height]) {
    ctx.beginPath();
    ctx.arc(stub, edge, 13, 0, 2 * Math.PI);
    ctx.fill();
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(Error('Could not encode voucher image'));
    }, 'image/png');
  });
}
