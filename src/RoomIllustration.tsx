/** Public, decorative illustration shared by every private room. */
export function RoomIllustration() {
  return (
    <svg
      className="room-illustration"
      viewBox="0 0 360 150"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 135H346M30 141H330M48 135V30M312 135V30" opacity=".35" />
        <path d="M48 37Q107 70 180 37Q253 70 312 37" />
        <g className="room-fairy-lights" fill="#e6c781" strokeWidth=".8">
          <circle cx="66" cy="45" r="2.8" />
          <circle cx="94" cy="52" r="2.8" />
          <circle cx="125" cy="53" r="2.8" />
          <circle cx="155" cy="46" r="2.8" />
          <circle cx="205" cy="46" r="2.8" />
          <circle cx="235" cy="53" r="2.8" />
          <circle cx="266" cy="52" r="2.8" />
          <circle cx="294" cy="45" r="2.8" />
        </g>
        <path d="M137 132V84H223V132M132 77H228V85H132Z" fill="#dcebf7" />
        <path d="M151 132V105Q180 76 209 105V132ZM147 91H213M144 117H150M210 117H216" />
        <path d="M166 128H195M170 125 193 130M169 130 194 125" />
        <path
          className="candle-flame"
          d="M179 124Q166 116 179 104Q178 113 186 111Q194 124 179 124Z"
          fill="#e6c781"
          stroke="#b28a43"
        />
        <path d="M154 76V61H160V76M201 76V62H207V76" fill="#f9f5e8" />
        <path
          className="candle-flame"
          d="M157 59Q151 53 157 47Q163 53 157 59ZM204 60Q198 54 204 48Q210 54 204 60Z"
          fill="#e6c781"
          stroke="#b28a43"
        />
        <path d="M171 76V67H190V76M169 67H192" />
        <path
          d="M179 67V57M179 63Q166 61 170 55Q180 54 179 63ZM180 60Q190 58 188 52Q179 52 180 60Z"
          fill="#c7dfdc"
        />
        <path
          d="M67 132V91Q79 83 94 91V132M67 105H94M72 132V139M91 132V139M66 117H96"
          fill="#dcebf7"
        />
        <path d="M70 94 91 95V108H70ZM72 112H90" />
        <path d="M107 132V111M99 111H117L113 91H103ZM102 133H113" />
        <path
          d="M254 132V109H273V132ZM252 109H275M264 108V75M264 98Q245 95 247 84Q263 82 264 98ZM264 89Q280 89 281 77Q265 74 264 89Z"
          fill="#c7dfdc"
        />
        <ellipse cx="180" cy="141" rx="58" ry="5" />
        <g className="sleepy-cat" fill="#dcebf7">
          <path d="M282 132Q276 118 287 115L286 106 295 112 303 108 304 117Q321 118 318 131ZM302 130Q313 121 320 130" />
          <path d="M289 119 292 120M298 119 301 118" />
        </g>
        <path d="M119 22V31M115 26H123M240 15V24M236 19H244" opacity=".6" />
      </g>
    </svg>
  );
}
