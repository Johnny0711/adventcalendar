import { useState, type CSSProperties } from 'react';
import { createVoucherImage, type CouponBlock } from './voucherImage';

export function Coupon({
  block,
  url,
  day,
  index,
}: {
  block: CouponBlock;
  url: string;
  day: number;
  index: number;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    setSaving(true);
    setError(false);
    try {
      const file = await createVoucherImage(block, url);
      const download = document.createElement('a');
      const fileUrl = URL.createObjectURL(file);
      download.href = fileUrl;
      download.download = `voucher-day-${String(day).padStart(2, '0')}-${index + 1}.png`;
      document.body.append(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="coupon-block">
      <section
        className="coupon"
        style={{ '--coupon-accent': block.color } as CSSProperties}
      >
        <div className="coupon-stub" aria-hidden="true">
          <span className="coupon-emblem">{block.icon ?? '♡'}</span>
        </div>
        <div className="coupon-main">
          <div className="coupon-copy">
            <p className="coupon-label">Gift voucher</p>
            <h2>{block.title}</h2>
            {block.description && (
              <p className="coupon-description">{block.description}</p>
            )}
            <button
              className="coupon-save"
              type="button"
              onClick={save}
              disabled={saving}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v11m-4-4 4 4 4-4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
              </svg>
              {saving ? 'Saving…' : 'Save voucher'}
            </button>
            {error && (
              <p role="status">Couldn’t save the voucher. Try again.</p>
            )}
          </div>
          {url && <img src={url} alt={block.alt ?? ''} loading="lazy" />}
        </div>
      </section>
    </div>
  );
}
