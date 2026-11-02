import { Children, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type Overview = { year: number; days: { day: number; available: boolean }[] };
// A little finding game, like the doors on a physical Advent calendar.
export const DOOR_ORDER = [
  8, 16, 3, 12, 5, 21, 19, 2, 24, 7, 15, 10, 4, 13, 9, 20, 1, 17, 22, 6, 18, 11,
  23, 14,
];

function Roof() {
  return (
    <svg
      className="house-roof"
      viewBox="0 0 900 250"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M118 127V49H162V130"
        fill="#476e9a"
        stroke="#142f52"
        strokeWidth="7"
      />
      <path
        d="M112 48H168"
        stroke="#e5eff5"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M22 227 182 79 310 195 450 21 590 195 718 79 878 227Z"
        fill="#244d79"
        stroke="#102b4f"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path
        d="M46 221 182 98 310 213 450 42 590 213 718 98 854 221"
        stroke="#5c7fa4"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M21 224 182 75 310 191 450 17 590 191 718 75 879 224"
        stroke="#e3eef6"
        strokeWidth="17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M184 124V193M166 145H202M718 124V193M700 145H736"
        stroke="#6488ad"
        strokeWidth="3"
      />
      <circle
        cx="450"
        cy="136"
        r="32"
        fill="#17365b"
        stroke="#7897b5"
        strokeWidth="4"
      />
      <path
        d="M450 151 436 138C424 125 442 115 450 127 458 115 476 125 464 138Z"
        fill="#f1d79d"
      />
      <path
        d="M411 187H489"
        stroke="#7795b3"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M27 231Q100 251 182 231T310 231Q380 253 450 231T590 231Q655 253 718 231T873 231"
        stroke="#133d53"
        strokeWidth="11"
      />
      {[
        54, 105, 157, 211, 265, 322, 377, 430, 483, 538, 593, 647, 701, 754,
        808, 859,
      ].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy={i % 2 ? 240 : 236}
          r="4"
          fill="#f3d59b"
          className="fairy-light"
        />
      ))}
    </svg>
  );
}

function Garden() {
  return (
    <svg
      className="winter-garden"
      viewBox="0 0 1100 630"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 589Q200 564 550 596T1100 582V630H0Z" fill="#dce9f3" />
      <path d="M0 613Q310 581 570 615T1100 602V630H0Z" fill="#f1f6fa" />
      <g fill="#214c68" stroke="#a4c6d9" strokeWidth="3" strokeLinejoin="round">
        <path d="M68 353 34 417H51L18 478H39L3 547H133L97 478H118L84 417H102Z" />
        <path d="M1034 309 996 386H1013L975 461H998L955 549H1110L1068 461H1090L1053 386H1071Z" />
      </g>
      <path
        d="M68 353 43 400M34 450 22 474M1034 309 1009 361M991 432 978 458M971 518 958 545"
        stroke="#e6f1f6"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path d="M68 548V586M1034 550V580" stroke="#b0c3d2" strokeWidth="9" />
      <g stroke="#8aacc3" strokeWidth="3">
        <path d="M145 530V578M170 525V575M195 530V575M140 545H200M900 545H960M907 530V578M932 525V575M957 530V575" />
      </g>
      <path
        d="M157 586Q310 570 414 581M692 584Q820 570 932 587"
        stroke="white"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NightSky() {
  return (
    <svg
      className="night-sky"
      viewBox="0 0 1440 1000"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="1180" cy="155" r="33" fill="#ecedf0" opacity=".93" />
      <circle cx="1195" cy="141" r="32" fill="#153b64" />
      <g fill="#c9e0ee" opacity=".65">
        {[
          [133, 135],
          [343, 79],
          [601, 106],
          [922, 82],
          [1274, 338],
          [105, 468],
          [1317, 620],
          [272, 700],
          [1067, 749],
          [792, 49],
          [554, 846],
          [1120, 427],
          [370, 295],
          [984, 269],
          [85, 791],
          [1351, 98],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />
        ))}
      </g>
      <g stroke="#d8e9f3" strokeWidth="1.5" opacity=".7">
        <path d="M235 216V230M228 223H242M1028 202V214M1022 208H1034M1245 489V505M1237 497H1253M155 618V630M149 624H161" />
      </g>
    </svg>
  );
}

export function House({
  activeDay,
  opening = false,
  loading = false,
  children,
}: {
  activeDay?: number;
  opening?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}) {
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
      className={`house-scene${opening ? ' house-scene--opening' : ''}`}
      aria-label="Your Advent calendar house"
      aria-busy={loading}
    >
      <div className="house-view" inert={hasNotice}>
        <NightSky />
        <div className="scene-caption" aria-hidden="true">
          <span className="tiny-star">✧</span> a little december, just for you{' '}
          <span className="tiny-star">✧</span>
        </div>
        <h1 className="sr-only">Your little house of December</h1>
        <div className="house-setting">
          <Garden />
          <div className="calendar-house">
            <Roof />
            <div className="house-facade">
              <div className="house-plaque">
                DECEMBER <span>with love</span>
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
                  const face = (
                    <>
                      <span className="door-interior" aria-hidden="true">
                        <span>✦</span>
                      </span>
                      <span className="door-leaf" aria-hidden="true">
                        <span className="door-panel" />
                        <span className="door-number">
                          {String(day).padStart(2, '0')}
                        </span>
                        <span className="door-handle" />
                      </span>
                      <span className="door-sill" aria-hidden="true" />
                    </>
                  );
                  return entry ? (
                    <Link
                      key={day}
                      className={className}
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
                      aria-label={`December ${day}, locked. Scan its QR code to unlock`}
                      onClick={() => setHint(day)}
                    >
                      {face}
                    </button>
                  );
                })}
              </div>
              <div className="house-base" aria-hidden="true">
                <span />
                <span className="house-sign">
                  24 little moments · one December
                </span>
                <span />
              </div>
            </div>
            <div className="house-step" aria-hidden="true" />
          </div>
        </div>
        <div className="scene-note" aria-live="polite">
          {loading ? (
            <p>Finding your little door…</p>
          ) : opening ? (
            <p>Door {activeDay} is opening. Come on in…</p>
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
              <p>Scan a hidden QR code. Open a little magic.</p>
              <div className="calendar-progress">
                <span className="lit-dot" />
                {count} of 24 surprises unlocked
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
      {children}
    </section>
  );
}
