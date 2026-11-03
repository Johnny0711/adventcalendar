// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, DOOR_OPEN_MS, DOOR_PAUSE_MS } from '../src/App';
import { DOOR_ORDER } from '../src/House';

const content = {
  day: 1,
  title: 'A quiet winter letter',
  blocks: [{ type: 'letter', content: 'Your private little message.' }],
};
const overview = {
  year: 2026,
  days: [
    { day: 1, available: true },
    { day: 2, available: false },
  ],
};
const response = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

describe('house calendar and protected door transitions', () => {
  let host: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    vi.stubGlobal('scrollTo', vi.fn());
    fetchMock = vi.fn((url: string) =>
      url === '/api/unlocked' ? response(overview) : response(content),
    );
    vi.stubGlobal('fetch', fetchMock);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  async function render(path = '/') {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );
    });
  }
  async function advance(ms: number) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }
  async function click(selector: string) {
    const target = host.querySelector(selector);
    expect(target).not.toBeNull();
    await act(async () => {
      target!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
  }
  const door = (day: number) =>
    host.querySelector(`[aria-label^="December ${day},"]`);

  it('renders exactly 24 unique house doors immediately without a large header', async () => {
    await render();
    expect(host.querySelectorAll('.house-door')).toHaveLength(24);
    expect(new Set(DOOR_ORDER).size).toBe(24);
    expect([...DOOR_ORDER].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
    expect(host.querySelector('header')).toBeNull();
    expect(host.querySelector('.hero')).toBeNull();
    expect(door(1)?.tagName).toBe('A');
    expect(door(2)?.classList.contains('house-door--future')).toBe(true);
    expect(door(3)?.tagName).toBe('BUTTON');
    expect(host.textContent).toContain('1 of 24');
  });
  it('explains locked doors without requesting private content', async () => {
    await render();
    await click('[aria-label^="December 3,"]');
    expect(host.textContent).toContain('Door 3 is waiting for its QR code');
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/unlocked')).toBe(
      true,
    );
    await click('[aria-label="Dismiss door hint"]');
    expect(host.querySelector('.door-hint')).toBeNull();
  });
  it('arrives at the house, opens only the authorized QR door, then reveals content', async () => {
    await render('/day/1');
    expect(host.querySelector('.house-scene')).not.toBeNull();
    expect(host.textContent).not.toContain(content.title);
    expect(host.querySelector('.is-opening')).toBeNull();
    await advance(DOOR_PAUSE_MS);
    expect(host.querySelectorAll('.is-opening')).toHaveLength(1);
    expect(door(1)?.classList.contains('is-opening')).toBe(true);
    expect(host.querySelector('.door-journey')).not.toBeNull();
    expect(host.querySelectorAll('.journey-door .door-shutter')).toHaveLength(
      2,
    );
    expect(host.textContent).not.toContain(content.title);
    await advance(DOOR_OPEN_MS);
    expect(host.querySelector('.house-scene')).toBeNull();
    expect(host.textContent).toContain(content.title);
    expect(host.textContent).toContain('Your private little message.');
    expect(document.activeElement).toBe(host.querySelector('.day-page h1'));
  });
  it('returns from content to the whole house and lets an unlocked door reopen', async () => {
    await render('/day/1');
    await advance(DOOR_PAUSE_MS + DOOR_OPEN_MS);
    await click('.inside-topbar .back-to-house');
    expect(host.querySelectorAll('.house-door')).toHaveLength(24);
    expect(host.querySelector('.day-page')).toBeNull();
    await click('[aria-label^="December 1,"]');
    await advance(DOOR_PAUSE_MS + DOOR_OPEN_MS);
    expect(host.textContent).toContain(content.title);
  });
  for (const [status, expected] of [
    [401, 'Open this day with its QR code'],
    [423, 'This door opens in December'],
    [404, 'This door isn’t here'],
  ] as const) {
    it(`never opens or reveals private content on a ${status} response`, async () => {
      fetchMock.mockImplementation((url: string) =>
        url === '/api/unlocked'
          ? response(overview)
          : response({ error: 'Denied', year: 2026 }, status),
      );
      await render('/day/2');
      await advance(5000);
      expect(host.querySelectorAll('.house-door')).toHaveLength(24);
      expect(host.querySelector('.is-opening')).toBeNull();
      expect(host.querySelector('.door-journey')).toBeNull();
      expect(host.textContent).toContain(expected);
      expect(host.textContent).not.toContain(content.title);
      expect(host.querySelector('.day-page')).toBeNull();
      expect(host.querySelector('.house-view')?.hasAttribute('inert')).toBe(
        true,
      );
      await click('.notice-card .back-to-house');
      expect(host.querySelector('.notice-layer')).toBeNull();
    });
  }
  it('brings the authorized door into view and restores it when returning home', async () => {
    const previous = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView',
    );
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    try {
      await render('/day/1');
      expect(scroll).toHaveBeenCalledWith({
        block: 'center',
        behavior: 'instant',
      });
      expect(
        (scroll.mock.contexts[0] as Element).getAttribute('data-day'),
      ).toBe('1');
      await advance(DOOR_PAUSE_MS + DOOR_OPEN_MS);
      scroll.mockClear();
      await click('.inside-topbar .back-to-house');
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(
        (scroll.mock.contexts[0] as Element).getAttribute('data-day'),
      ).toBe('1');
    } finally {
      if (previous)
        Object.defineProperty(Element.prototype, 'scrollIntoView', previous);
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
  it('honors reduced motion by skipping the door and room animations', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    await render('/day/1');
    expect(host.textContent).toContain(content.title);
    expect(host.querySelector('.house-scene')).toBeNull();
  });
  it('shows and retries an overview failure without inventing unlocked days', async () => {
    let failed = false;
    fetchMock.mockImplementation(() => {
      if (!failed) {
        failed = true;
        return Promise.reject(Error('Offline'));
      }
      return response(overview);
    });
    await render();
    expect(host.textContent).toContain('couldn’t check your opened doors');
    expect(host.querySelector('a.house-door')).toBeNull();
    await click('.text-button');
    expect(door(1)?.tagName).toBe('A');
    expect(host.textContent).toContain('1 of 24');
  });
  it('keeps all content block types and media URLs within the protected day', async () => {
    const combined = {
      ...content,
      blocks: [
        { type: 'text', content: 'A short note' },
        { type: 'letter', content: 'A letter' },
        { type: 'image', src: 'memory.webp', alt: 'A snowy morning' },
        { type: 'video', src: 'hello.mp4', caption: 'Hello' },
        { type: 'audio', src: 'hello.mp3', caption: 'Listen' },
        { type: 'file', src: 'invite.pdf', label: 'An invitation' },
        {
          type: 'quiz',
          question: 'Pick a star',
          options: ['North', 'South'],
          answer: 0,
          explanation: 'A little light.',
        },
      ],
    };
    fetchMock.mockImplementation((url: string) =>
      url === '/api/unlocked' ? response(overview) : response(combined),
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    await render('/day/1');
    for (const element of host.querySelectorAll('.blocks [src]'))
      expect(element.getAttribute('src')).toMatch(/^\/api\/media\/1\//);
    expect(host.querySelector('.blocks a')?.getAttribute('href')).toBe(
      '/api/media/1/invite.pdf',
    );
    expect(host.querySelector('video')?.hasAttribute('playsinline')).toBe(true);
    await click('.choices button');
    expect(host.textContent).toContain('A little light.');
  });
  it('keeps the house visible during a slow protected request and does not open early', async () => {
    let finish:
      ((value: Awaited<ReturnType<typeof response>>) => void) | undefined;
    fetchMock.mockImplementation((url: string) =>
      url === '/api/unlocked'
        ? response(overview)
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    await render('/day/1');
    await advance(5000);
    expect(host.textContent).toContain('Loading calendar');
    expect(host.querySelector('.is-opening')).toBeNull();
    await act(async () => {
      finish!({ ok: true, status: 200, json: async () => content });
    });
    await advance(DOOR_PAUSE_MS + DOOR_OPEN_MS);
    expect(host.textContent).toContain(content.title);
  });
  it('supports retry after a network error without pretending the door is unlocked', async () => {
    let failed = false;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/unlocked') return response(overview);
      if (!failed) {
        failed = true;
        return Promise.reject(Error('Offline'));
      }
      return response(content);
    });
    await render('/day/1');
    expect(host.textContent).toContain('Unable to load this day');
    expect(host.querySelector('.is-opening')).toBeNull();
    await click('.notice-card .button');
    await advance(DOOR_PAUSE_MS + DOOR_OPEN_MS);
    expect(host.textContent).toContain(content.title);
  });
  it('does not leak stale content when navigating away during an entrance', async () => {
    await render('/day/1');
    await advance(DOOR_PAUSE_MS);
    await click('[aria-label^="December 3,"]'); // Still locked: only shows a hint.
    expect(host.textContent).not.toContain(content.title);
    await act(async () => {
      root.render(
        <MemoryRouter key="home" initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );
    });
    await advance(5000);
    expect(host.querySelector('.day-page')).toBeNull();
    expect(host.querySelector('.is-opening')).toBeNull();
  });
  it('renders invalid QR and unknown-page messages over the house', async () => {
    await render('/invalid');
    expect(host.textContent).toContain('This key couldn’t open a door');
    expect(host.querySelectorAll('.house-door')).toHaveLength(24);
    await click('.notice-card .back-to-house');
    expect(host.querySelector('.notice-layer')).toBeNull();
    await act(async () => {
      root.render(
        <MemoryRouter key="unknown" initialEntries={['/not-a-page']}>
          <App />
        </MemoryRouter>,
      );
    });
    expect(host.textContent).toContain('Page not found');
  });
});
