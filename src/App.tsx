import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import type { DayContent } from '../server/content';
import { House } from './House';
import { ContentBlocks } from './ContentBlocks';
import { RoomIllustration } from './RoomIllustration';

// Both stages begin only after the server authorizes this day's content.
import { DOOR_PAUSE_MS, DOOR_OPEN_MS } from './motion';
export { DOOR_PAUSE_MS, DOOR_OPEN_MS } from './motion';
type DayState = { status: number; content?: DayContent; year?: number };

function ReturnHome({
  children = 'Back to calendar',
}: {
  children?: React.ReactNode;
}) {
  const { day } = useParams();
  return (
    <Link
      className="back-to-house"
      to="/"
      state={day ? { returnDay: Number(day) } : undefined}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z" />
      </svg>
      {children}
    </Link>
  );
}

function Notice({
  symbol,
  title,
  children,
}: {
  symbol: string;
  title: string;
  children: React.ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className="notice-layer">
      <section className="notice-card" aria-labelledby="notice-title">
        <span className="notice-symbol" aria-hidden="true">
          {symbol}
        </span>
        <h2 id="notice-title" ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <div className="notice-copy">{children}</div>
        <ReturnHome />
      </section>
    </div>
  );
}

function DayExperience({ day }: { day: string }) {
  const [state, setState] = useState<DayState>({ status: 0 });
  const [phase, setPhase] = useState<'arriving' | 'opening' | 'content'>(
    'arriving',
  );
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/days/${encodeURIComponent(day)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json();
        if (!controller.signal.aborted)
          setState(
            response.ok
              ? { status: 200, content: body }
              : { status: response.status, year: body.year },
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 503 });
      });
    return () => controller.abort();
  }, [day, attempt]);
  useEffect(() => {
    if (state.status !== 200) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('content');
      return;
    }
    const open = window.setTimeout(() => setPhase('opening'), DOOR_PAUSE_MS);
    const enter = window.setTimeout(
      () => setPhase('content'),
      DOOR_PAUSE_MS + DOOR_OPEN_MS,
    );
    return () => {
      window.clearTimeout(open);
      window.clearTimeout(enter);
    };
  }, [state.status]);
  useEffect(() => {
    if (phase === 'content') {
      window.scrollTo({ top: 0, behavior: 'auto' });
      heading.current?.focus();
    }
  }, [phase]);

  if (phase === 'content' && state.content)
    return (
      <div className="inside-scene">
        <div className="inside-topbar">
          <ReturnHome />
          <span>Advent Calendar</span>
        </div>
        <article className="day-page">
          <div className="room-heading">
            <div className="day-dateline">
              <span />
              DECEMBER {state.content.day}
              <span />
            </div>
            <div className="day-badge" aria-hidden="true">
              {String(state.content.day).padStart(2, '0')}
            </div>
            <h1 ref={heading} tabIndex={-1}>
              {state.content.title}
            </h1>
            <span className="content-star" aria-hidden="true">
              ✧
            </span>
            <RoomIllustration />
          </div>
          <ContentBlocks content={state.content} />
          <ReturnHome>See all 24 doors</ReturnHome>
        </article>
      </div>
    );
  const validDay = /^(0?[1-9]|1[0-9]|2[0-4])$/.test(day)
    ? Number(day)
    : undefined;
  return (
    <House
      activeDay={validDay}
      opening={phase === 'opening'}
      arriving={state.status === 200}
      loading={state.status === 0}
    >
      {state.status === 401 && (
        <Notice symbol="◇" title="Open this day with its QR code">
          <p>
            Scan the QR code behind this day’s chocolate to open door {validDay}
            .
          </p>
        </Notice>
      )}
      {state.status === 423 && (
        <Notice symbol="☾" title="This door opens in December">
          <p>
            Door {validDay} opens on December {validDay}, {state.year}. Your
            scan is remembered. Come back when the day arrives.
          </p>
        </Notice>
      )}
      {(state.status === 400 || state.status === 404) && (
        <Notice symbol="✧" title="This door isn’t here.">
          <p>Choose a day from 1 to 24 on the calendar.</p>
        </Notice>
      )}
      {![0, 200, 400, 401, 404, 423].includes(state.status) && (
        <Notice symbol="♡" title="Unable to load this day">
          <p>
            We couldn’t load your surprise. Check your connection and try again.
          </p>
          <button
            className="button"
            type="button"
            onClick={() => {
              setState({ status: 0 });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </Notice>
      )}
    </House>
  );
}

function DayRoute() {
  const { day } = useParams();
  return <DayExperience key={day} day={day ?? ''} />;
}

export function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <main id="main">
        <Routes>
          <Route path="/" element={<House />} />
          <Route path="/day/:day" element={<DayRoute />} />
          <Route
            path="/invalid"
            element={
              <House>
                <Notice symbol="◇" title="This key couldn’t open a door.">
                  <p>
                    Your QR code may be incomplete or no longer active. Try
                    scanning the original code again.
                  </p>
                </Notice>
              </House>
            }
          />
          <Route
            path="*"
            element={
              <House>
                <Notice symbol="✧" title="Page not found">
                  <p>This page is not part of your advent calendar.</p>
                </Notice>
              </House>
            }
          />
        </Routes>
      </main>
    </>
  );
}
