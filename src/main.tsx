import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useParams,
} from 'react-router-dom';
import type { DayContent } from '../server/content';
import './style.css';
type Overview = { year: number; days: { day: number; available: boolean }[] };
function useOverview() {
  const [value, set] = useState<Overview>();
  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/unlocked', { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(set)
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return value;
}
function Calendar() {
  const data = useOverview();
  return (
    <section className="calendar-section">
      <p className="eyebrow">TWENTY-FOUR LITTLE SURPRISES</p>
      <h2>A December made for you</h2>
      <p className="muted">
        One chocolate. One hidden code. One little moment together.
      </p>
      <div className="calendar">
        {Array.from({ length: 24 }, (_, i) => {
          const day = i + 1,
            entry = data?.days.find((d) => d.day === day);
          return entry ? (
            <Link
              className={`door ${entry.available ? 'opened' : 'future'}`}
              key={day}
              to={`/day/${day}`}
              aria-label={`December ${day}${entry.available ? ', unlocked' : ', opens later'}`}
            >
              <span>{String(day).padStart(2, '0')}</span>
              <small>{entry.available ? 'a little joy ↗' : 'soon ◇'}</small>
            </Link>
          ) : (
            <div
              className="door locked"
              key={day}
              aria-label={`December ${day}, scan QR to unlock`}
            >
              <span>{String(day).padStart(2, '0')}</span>
              <small>◇</small>
            </div>
          );
        })}
      </div>
      <p className="footnote">
        Your opened surprises stay here, ready to revisit.
      </p>
    </section>
  );
}
function Home() {
  return (
    <>
      <section className="hero">
        <div className="ornament" aria-hidden="true">
          ✧
        </div>
        <p className="eyebrow">A LITTLE DECEMBER MAGIC</p>
        <h1>
          For you,
          <br />
          <em>with love.</em>
        </h1>
        <p className="intro">
          Twenty-four small reasons to smile.
          <br />A little sweetness, a little wonder,
          <br />
          and something just for you.
        </p>
        <div className="rule" />
        <p className="scan-note">
          Open a chocolate door and scan the hidden QR code.
          <br />
          Your next surprise is waiting inside.
        </p>
        <a className="button" href="#calendar">
          Explore your December <span>↓</span>
        </a>
        <span className="star star-one" aria-hidden="true">
          ✧
        </span>
        <span className="star star-two" aria-hidden="true">
          ✦
        </span>
      </section>
      <div id="calendar">
        <Calendar />
      </div>
    </>
  );
}
function StateCard({
  symbol,
  title,
  children,
}: {
  symbol: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="state-card">
      <span className="ornament" aria-hidden="true">
        {symbol}
      </span>
      <p className="eyebrow">A LITTLE DECEMBER MAGIC</p>
      <h1>{title}</h1>
      <div className="muted">{children}</div>
      <Link className="button" to="/">
        Back to your calendar
      </Link>
    </section>
  );
}
function Quiz({
  block,
}: {
  block: Extract<DayContent['blocks'][number], { type: 'quiz' }>;
}) {
  const [choice, set] = useState<number>();
  return (
    <section className="quiz">
      <h2>{block.question}</h2>
      <div className="choices">
        {block.options.map((o, i) => (
          <button key={i} aria-pressed={choice === i} onClick={() => set(i)}>
            {o}
          </button>
        ))}
      </div>
      {choice !== undefined && (
        <p role="status">
          {choice === block.answer
            ? 'That’s the one! ♡'
            : 'Another little guess?'}{' '}
          {choice === block.answer && block.explanation}
        </p>
      )}
    </section>
  );
}
function Blocks({ content }: { content: DayContent }) {
  return (
    <div className="blocks">
      {content.blocks.map((b, i) => {
        const url =
          'src' in b
            ? `/api/media/${content.day}/${encodeURIComponent(b.src)}`
            : '';
        switch (b.type) {
          case 'text':
            return (
              <p key={i} className="message">
                {b.content}
              </p>
            );
          case 'letter':
            return (
              <div key={i} className="letter">
                {b.content}
              </div>
            );
          case 'image':
            return (
              <figure key={i}>
                <img src={url} alt={b.alt} loading="lazy" />
                <figcaption>{b.alt}</figcaption>
              </figure>
            );
          case 'video':
            return (
              <figure key={i}>
                <video
                  src={url}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={b.caption ?? 'Video message'}
                />
                {b.caption && <figcaption>{b.caption}</figcaption>}
              </figure>
            );
          case 'audio':
            return (
              <figure key={i}>
                <audio
                  src={url}
                  controls
                  preload="metadata"
                  aria-label={b.caption ?? 'Audio message'}
                />
                {b.caption && <figcaption>{b.caption}</figcaption>}
              </figure>
            );
          case 'file':
            return (
              <a key={i} className="button" href={url}>
                {b.label} ↓
              </a>
            );
          case 'quiz':
            return <Quiz key={i} block={b} />;
        }
      })}
    </div>
  );
}
function Day() {
  const { day } = useParams();
  const [state, set] = useState<{
    content?: DayContent;
    status: number;
    year?: number;
  }>({ status: 0 });
  const [retry, retrySet] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    set({ status: 0 });
    fetch(`/api/days/${encodeURIComponent(day ?? '')}`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        const body = await r.json();
        set(
          r.ok
            ? { content: body, status: 200 }
            : { status: r.status, year: body.year },
        );
      })
      .catch((e) => {
        if (e.name !== 'AbortError') set({ status: 503 });
      });
    return () => ctrl.abort();
  }, [day, retry]);
  if (state.status === 0)
    return (
      <p className="loading" role="status">
        Unwrapping a little magic…
      </p>
    );
  if (state.status === 401)
    return (
      <StateCard symbol="◇" title="A surprise, still wrapped.">
        <p>
          Scan the QR code behind this day’s chocolate to open your surprise.
        </p>
      </StateCard>
    );
  if (state.status === 423)
    return (
      <StateCard symbol="☾" title="Not quite yet.">
        <p>
          This little surprise opens on December {Number(day)}, {state.year}.
          Come back when the day arrives. Your scan is safely remembered.
        </p>
      </StateCard>
    );
  if (state.status === 400 || state.status === 404) return <NotFound />;
  if (!state.content)
    return (
      <StateCard symbol="♡" title="A little pause.">
        <p>
          We couldn’t load this surprise. Check your connection and try again.
        </p>
        <button onClick={() => retrySet((v) => v + 1)}>Try again</button>
      </StateCard>
    );
  return (
    <>
      <article className="day-page">
        <Link className="back-link" to="/">
          ← Your December
        </Link>
        <p className="eyebrow">DECEMBER {state.content.day}</p>
        <div className="day-badge">
          {String(state.content.day).padStart(2, '0')}
        </div>
        <h1>{state.content.title}</h1>
        <div className="rule" />
        <Blocks content={state.content} />
        <p className="signature">With love, always ♡</p>
      </article>
      <Calendar />
    </>
  );
}
function NotFound() {
  return (
    <StateCard symbol="✧" title="A little lost? ">
      <p>This page isn’t part of your calendar. Let’s find your way back.</p>
    </StateCard>
  );
}
function App() {
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header>
        <Link to="/" className="brand">
          december <span>♡</span>
        </Link>
        <span className="header-note">a little something, just for you</span>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/day/:day" element={<Day />} />
          <Route
            path="/invalid"
            element={
              <StateCard symbol="◇" title="This code couldn’t open a door.">
                <p>
                  The QR code may be incomplete or no longer active. Try
                  scanning the original code again.
                </p>
              </StateCard>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer>
        Made with love. Opened with a little chocolate. <span>♡</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
