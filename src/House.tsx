import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DOOR_OPEN_MS } from './motion';

type Overview = { year: number; days: { day: number; available: boolean }[] };
// A little finding game, like the doors on a physical Advent calendar.
export const DOOR_ORDER = [
  8, 16, 3, 12, 5, 21, 19, 2, 24, 7, 15, 10, 4, 13, 9, 20, 1, 17, 22, 6, 18, 11,
  23, 14,
];

// Decorative line art never previews private day content.
function WindowIllustration({ variant }: { variant: number }) {
  return (
    <svg
      className="window-illustration"
      viewBox="0 0 200 130"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 113 63 83H199M63 83V0M12 121H190M78 0V83" />
        {variant === 0 ? (
          <>
            <ellipse cx="119" cy="85" rx="56" ry="12" />
            <path d="M64 85V91Q119 115 175 91V85M79 98V126M161 98V126M113 99V121M30 96V61Q43 53 55 61V87M30 74H55M38 95V111M20 107V79H30" />
            <path d="M100 77V59H115V77M97 60H118M106 59V44M132 83V64H143V83M129 64H146M137 64V51M88 81H94M149 85H158" />
            <path d="M104 43Q97 34 106 29Q114 36 104 43ZM137 50Q129 42 137 36Q145 44 137 50Z" />
            <ellipse cx="89" cy="85" rx="13" ry="4" />
            <ellipse cx="149" cy="93" rx="11" ry="3" />
            <path d="M85 8V38H119V8ZM90 13H114V32H90Z" />
          </>
        ) : (
          <>
            <path d="M19 107V79Q37 70 57 79V111M22 82 49 85V108M19 91 49 95M60 110 99 101V75L60 83ZM99 75 139 82V107L99 101M60 83 99 89 139 82M99 89V114M77 112V123M126 111V122" />
            <path d="M156 102V72M147 72H166L160 52H153ZM149 103H164M163 23V45H188V23ZM169 29H182V39H169Z" />
            <path d="M87 79V67H102V80M85 67H104M93 66Q88 56 95 51M111 82V76H123V83" />
          </>
        )}
      </g>
    </svg>
  );
}

function DoorFace({ day }: { day: number }) {
  const face = (
    <>
      <span className="door-panel" />
      {(day === 4 || day === 21) && (
        <WindowIllustration variant={day === 4 ? 0 : 1} />
      )}
      <span className="door-number">{String(day).padStart(2, '0')}</span>
      <span className="door-handle" />
    </>
  );
  return (
    <>
      <span className="door-interior" aria-hidden="true">
        <span className="door-heart">{'\u2661'}</span>
        <span className="door-sparkle">{'\u2727'}</span>
      </span>
      <span className="door-leaf" aria-hidden="true">
        <span className="door-shutter door-shutter--left">
          <span className="shutter-face">{face}</span>
        </span>
        <span className="door-shutter door-shutter--right">
          <span className="shutter-face">{face}</span>
        </span>
      </span>
      <span className="door-sill" aria-hidden="true" />
    </>
  );
}

export function House({
  activeDay,
  opening = false,
  loading = false,
  arriving = false,
  children,
}: {
  activeDay?: number;
  opening?: boolean;
  loading?: boolean;
  arriving?: boolean;
  children?: React.ReactNode;
}) {
  const houseRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const [journey, setJourney] = useState<CSSProperties>();
  const returnDay =
    location.pathname === '/' ? location.state?.returnDay : undefined;
  useLayoutEffect(() => {
    const target = arriving ? activeDay : returnDay;
    if (
      typeof target !== 'number' ||
      target < 1 ||
      target > 24 ||
      !Number.isInteger(target) ||
      (arriving &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    )
      return;
    houseRef.current
      ?.querySelector<HTMLElement>(`[data-day="${target}"]`)
      ?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  }, [activeDay, arriving, returnDay]);
  useLayoutEffect(() => {
    if (!opening || !activeDay) return;
    const door = houseRef.current?.querySelector<HTMLElement>(
      `[data-day="${activeDay}"]`,
    );
    if (!door) return;
    const rect = door.getBoundingClientRect();
    const scale = Math.min(
      2.6,
      (window.innerWidth - 80) / Math.max(rect.width, 1),
      (window.innerHeight * 0.5) / Math.max(rect.height, 1),
    );
    setJourney({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      '--travel-x': `${window.innerWidth / 2 - rect.left - rect.width / 2}px`,
      '--travel-y': `${window.innerHeight * 0.44 - rect.top - rect.height / 2}px`,
      '--travel-scale': scale,
    } as CSSProperties);
  }, [opening, activeDay]);
  const [overview, setOverview] = useState<Overview>();
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState<number>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/unlocked', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error();
        return response.json() as Promise<Overview>;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setOverview(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);
  const count = overview?.days.filter((day) => day.available).length ?? 0;
  const hasNotice = Children.toArray(children).length > 0;
  return (
    <section
      ref={houseRef}
      className={`house-scene${opening ? ' house-scene--opening' : ''}`}
      aria-label="Your Advent calendar house"
      aria-busy={loading}
    >
      <div className="house-view" inert={hasNotice}>
        <h1 className="scene-caption">Advent Calendar</h1>
        <div className="house-setting">
          <div className="calendar-house">
            <svg
              className="house-roof"
              viewBox="0 0 430 145"
              fill="none"
              aria-hidden="true"
            >
              <g stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <path
                  className="chimney-wisp"
                  d="M335 14Q348 4 335 -7T335 -29"
                />
                <path d="M321 83V26H349V101" fill="#d5e6f5" />
                <path d="M316 20H354V29H316Z" fill="#e9f3fc" />
                <path d="M8 133 215 7 422 133Z" fill="#d5e6f5" />
                <path d="M25 132 215 18 405 132M62 111H368M101 87H329M141 63H289" />
                <path d="M113 111 133 87M169 111 179 87M261 111 251 87M317 111 297 87M177 63 184 39M253 63 246 39" />
                <circle cx="215" cy="83" r="19" fill="#e9f3fc" />
                <circle cx="215" cy="83" r="14" />
                <path d="M215 69V97M201 83H229" />
                <path d="M3 133H427V142H3Z" fill="#e9f3fc" />
              </g>
            </svg>
            <div className="house-facade">
              <div className="house-plaque">
                <span className="plaque-eyebrow">1–24 December</span>
                DECEMBER <span>Advent Calendar</span>
              </div>
              <div
                className="house-doors"
                role="group"
                aria-label="24 Advent calendar doors"
              >
                {DOOR_ORDER.map((day) => {
                  const entry = overview?.days.find((item) => item.day === day);
                  const isOpening = opening && activeDay === day;
                  const unlocked = entry?.available || isOpening;
                  const status = unlocked
                    ? 'unlocked'
                    : entry
                      ? 'future'
                      : 'locked';
                  const className = `house-door house-door--${status}${activeDay === day ? ' is-selected' : ''}${isOpening ? ' is-opening' : ''}`;
                  const face = <DoorFace day={day} />;
                  return entry ? (
                    <Link
                      key={day}
                      className={className}
                      data-day={day}
                      to={`/day/${day}`}
                      aria-label={`December ${day}, ${entry.available ? 'unlocked. Open surprise' : 'opens later'}`}
                      aria-current={activeDay === day ? 'page' : undefined}
                    >
                      {face}
                    </Link>
                  ) : (
                    <button
                      key={day}
                      type="button"
                      className={className}
                      data-day={day}
                      aria-label={`December ${day}, locked. Scan its QR code to unlock`}
                      onClick={() => setHint(day)}
                    >
                      {face}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="shop-awning" aria-hidden="true" />
            <div className="house-base" aria-hidden="true">
              <div className="shop-entrance">
                <span>{'♡'}</span>
              </div>
              <div className="house-sign">
                <span>December</span>ADVENT CALENDAR
                <small>1–24 December</small>
              </div>
            </div>
            <div className="house-step" aria-hidden="true" />
          </div>
        </div>
        <div className="scene-note" aria-live="polite">
          {loading ? (
            <p>Loading calendar...</p>
          ) : opening ? (
            <p>Opening door {activeDay}...</p>
          ) : failed ? (
            <p>
              We couldn’t check your opened doors.{' '}
              <button
                className="text-button"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </button>
            </p>
          ) : (
            <>
              <p>
                Scan the QR code behind each day's chocolate to open its door.
              </p>
              <div className="calendar-progress">
                {count} of 24 doors unlocked
              </div>
            </>
          )}
        </div>
        {hint !== undefined && (
          <div className="door-hint" role="status">
            <span>Door {hint} is waiting for its QR code.</span>
            <button
              type="button"
              onClick={() => setHint(undefined)}
              aria-label="Dismiss door hint"
            >
              ×
            </button>
          </div>
        )}
      </div>
      {opening && journey && activeDay && (
        <div
          className="door-journey"
          aria-hidden="true"
          style={{ '--door-duration': `${DOOR_OPEN_MS}ms` } as CSSProperties}
        >
          <div className="journey-backdrop" />
          <div
            className="journey-door house-door house-door--unlocked"
            style={journey}
          >
            <DoorFace day={activeDay} />
          </div>
          <p className="journey-caption">December {activeDay}</p>
          <div className="journey-wash" />
        </div>
      )}
      {children}
    </section>
  );
}
