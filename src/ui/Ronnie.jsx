import { useEffect, useState } from 'react';
import { RONNIE_COLORS as C } from '../theme/ronnie.js';

// RONNIE — the character, ported faithfully from the design mock
// (Ronnie.dc.html, viewBox 0 0 160 150). Pure presentation: no data fetching,
// no mood logic. src/components/RonnieBanter.jsx decides what mood and line to
// show; this just draws whichever mood it's told.
//
// All five mood layers share one head/body/band/towel group so swapping
// `mood` only remounts the small face subtree, never the outer bob animation
// or the character as a whole.
const FONT = { fontFamily: 'var(--font-family)' };

export default function Ronnie({ mood = 'smug', size = 120, onPress, className = '' }) {
  const height = Math.round(size * (150 / 160));
  const [paused, setPaused] = useState(typeof document !== 'undefined' && document.hidden);

  // Animations must stop when the tab/screen isn't visible, not just slow
  // down — a backgrounded tab still runs CSS animations and would otherwise
  // burn battery indefinitely.
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const svg = (
    <svg
      viewBox="0 0 160 150"
      width={size}
      height={height}
      role="img"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <g className={`ronnie-bob${paused ? ' ronnie-paused' : ''}`}>
        <SharedBody />
        <MoodFace mood={mood} />
      </g>
    </svg>
  );

  if (!onPress) {
    return <span className={className} style={{ display: 'block', width: size, height }}>{svg}</span>;
  }

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label="Ronnie, your gym buddy"
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height, padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
    >
      {svg}
    </button>
  );
}

function SharedBody() {
  return (
    <>
      <path d="M8 148 C8 127 30 117 60 114 L102 114 C132 117 152 127 152 148 Z" fill={C.skin} stroke={C.outline} strokeWidth="3" strokeLinejoin="round" />
      <path d="M40 148 L46 121 C58 129 70 133 80 133 C92 133 104 129 114 121 L120 148 Z" fill={C.tankTop} stroke={C.outline} strokeWidth="3" strokeLinejoin="round" />
      <text x="80" y="144" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={C.outline} letterSpacing="0.8" style={FONT}>GYM BUDDY</text>
      <path d="M46 117 C62 128 98 128 114 117 L119 124 C102 136 60 136 41 124 Z" fill={C.towel} stroke={C.outline} strokeWidth="3" strokeLinejoin="round" />

      <ellipse cx="31" cy="70" rx="8" ry="12" fill={C.skin} stroke={C.outline} strokeWidth="3" />
      <ellipse cx="133" cy="70" rx="8" ry="12" fill={C.skin} stroke={C.outline} strokeWidth="3" />

      <path d="M30 56 C28 28 54 14 82 14 C112 14 135 30 133 60 C132 80 126 96 114 106 C108 122 70 124 60 108 C40 98 31 78 30 56 Z" fill={C.skin} stroke={C.outline} strokeWidth="3.5" strokeLinejoin="round" />

      <path d="M72 17 Q68 8 73 2" fill="none" stroke={C.outline} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M82 15 Q84 5 90 3" fill="none" stroke={C.outline} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M94 17 Q100 10 106 11" fill="none" stroke={C.outline} strokeWidth="3.5" strokeLinecap="round" />

      <path d="M38 34 C60 20 104 20 127 32 L128 40 C104 28 60 28 37 42 Z" fill={C.sweatband} stroke={C.outline} strokeWidth="3" strokeLinejoin="round" />
      <path d="M40 38 C60 25 104 25 125 36" fill="none" stroke={C.sweatbandStripe} strokeWidth="2" strokeLinecap="round" />

      <ellipse cx="82" cy="90" rx="7" ry="8" fill={C.nose} stroke={C.outline} strokeWidth="3" />
      <circle cx="79" cy="93" r="1.4" fill={C.outline} />
      <circle cx="85" cy="93" r="1.4" fill={C.outline} />
      <circle cx="52" cy="98" r="1" fill={C.outline} opacity="0.5" />
      <circle cx="57" cy="104" r="1" fill={C.outline} opacity="0.5" />
      <circle cx="110" cy="96" r="1" fill={C.outline} opacity="0.5" />
      <circle cx="106" cy="104" r="1" fill={C.outline} opacity="0.5" />
      <circle cx="72" cy="114" r="1" fill={C.outline} opacity="0.5" />
      <circle cx="96" cy="114" r="1" fill={C.outline} opacity="0.5" />
    </>
  );
}

function MoodFace({ mood }) {
  switch (mood) {
    case 'roast': return <FaceRoast />;
    case 'hype': return <FaceHype />;
    case 'impressed': return <FaceImpressed />;
    case 'sleepy': return <FaceSleepy />;
    default: return <FaceSmug />;
  }
}

function FaceSmug() {
  return (
    <g>
      <ellipse className="ronnie-blink-smug" cx="60" cy="66" rx="16" ry="14" fill={C.eyeWhite} stroke={C.outline} strokeWidth="3" />
      <ellipse className="ronnie-blink-smug" cx="102" cy="64" rx="12.5" ry="11.5" fill={C.eyeWhite} stroke={C.outline} strokeWidth="3" />
      <circle className="ronnie-pupil-shrink-smug" cx="64" cy="71" r="2.8" fill={C.outline} />
      <circle className="ronnie-pupil-shrink-smug" cx="105" cy="68" r="2.5" fill={C.outline} />
      <polygon points="41,50 79,50 79,62 41,58" fill={C.skin} />
      <path d="M41 58 L79 62" fill="none" stroke={C.outline} strokeWidth="3" strokeLinecap="round" />
      <polygon points="88,48 116,48 116,57 88,60" fill={C.skin} />
      <path d="M88 60 L116 57" fill="none" stroke={C.outline} strokeWidth="3" strokeLinecap="round" />
      <path d="M41 45 Q58 43 79 52" fill="none" stroke={C.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M88 41 Q102 34 117 42" fill="none" stroke={C.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M64 103 Q84 109 104 96" fill="none" stroke={C.outline} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="87" y="103" width="7" height="7" rx="1.5" fill={C.goldTooth} stroke={C.outline} strokeWidth="2" />
      <path d="M107 92 Q111 96 107 100" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function FaceRoast() {
  return (
    <g>
      <ellipse className="ronnie-blink-roast" cx="60" cy="66" rx="16" ry="14" fill={C.eyeWhite} stroke={C.outline} strokeWidth="3" />
      <ellipse className="ronnie-blink-roast" cx="102" cy="64" rx="12.5" ry="11.5" fill={C.eyeWhite} stroke={C.outline} strokeWidth="3" />
      <circle className="ronnie-pupil-shrink-roast" cx="60" cy="74" r="2" fill={C.outline} />
      <circle className="ronnie-pupil-shrink-roast" cx="102" cy="70" r="2" fill={C.outline} />
      <polygon points="41,50 79,50 79,70 41,64" fill={C.skin} />
      <path d="M41 64 L79 70" fill="none" stroke={C.outline} strokeWidth="3" strokeLinecap="round" />
      <polygon points="88,48 116,48 116,64 88,64" fill={C.skin} />
      <path d="M88 64 L116 64" fill="none" stroke={C.outline} strokeWidth="3" strokeLinecap="round" />
      <path d="M48 83 Q60 87 72 83" fill="none" stroke={C.outline} strokeWidth="2" strokeLinecap="round" />
      <path d="M41 46 L79 49" fill="none" stroke={C.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M88 47 L117 45" fill="none" stroke={C.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M66 107 Q84 101 102 107" fill="none" stroke={C.outline} strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

function FaceHype() {
  return (
    <g>
      <ellipse cx="60" cy="64" rx="17" ry="17" fill={C.eyeWhite} stroke={C.outline} strokeWidth="3" />
      <ellipse cx="102" cy="62" rx="14" ry="14" fill={C.eyeWhite} stroke={C.outline} strokeWidth="3" />
      <circle cx="62" cy="64" r="4.5" fill={C.outline} />
      <circle cx="103" cy="62" r="4" fill={C.outline} />
      <path d="M62 98 Q84 95 106 98 Q104 114 84 114 Q64 114 62 98 Z" fill={C.mouthInterior} stroke={C.outline} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M63.5 99 Q84 96 104.5 99 L103.5 105 Q84 102 64.5 105 Z" fill={C.eyeWhite} stroke={C.outline} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="84" cy="109" rx="10" ry="4" fill={C.tongue} />
      <g className="ronnie-spark" stroke={C.hypeSpark} strokeWidth="3" strokeLinecap="round">
        <path d="M14 42 L24 47" />
        <path d="M11 58 L23 59" />
        <path d="M146 42 L136 47" />
        <path d="M149 58 L137 59" />
      </g>
      <g className="ronnie-sweat">
        <path d="M144 14 C140 22 140 26 144 26 C148 26 148 22 144 14 Z" fill={C.hypeSweat} stroke={C.outline} strokeWidth="2" />
      </g>
    </g>
  );
}

function FaceImpressed() {
  return (
    <g>
      <ellipse className="ronnie-blink-impressed" cx="60" cy="66" rx="16" ry="14" fill={C.eyeWhite} stroke={C.outline} strokeWidth="3" />
      <ellipse className="ronnie-blink-impressed" cx="102" cy="64" rx="12.5" ry="11.5" fill={C.eyeWhite} stroke={C.outline} strokeWidth="3" />
      <circle className="ronnie-pupil-shrink-impressed" cx="60" cy="70" r="2.8" fill={C.outline} />
      <circle className="ronnie-pupil-shrink-impressed" cx="102" cy="68" r="2.8" fill={C.outline} />
      <polygon points="41,50 79,50 79,60 41,59" fill={C.skin} />
      <path d="M41 59 L79 60" fill="none" stroke={C.outline} strokeWidth="3" strokeLinecap="round" />
      <polygon points="88,46 116,46 116,56 88,56" fill={C.skin} />
      <path d="M88 56 L116 56" fill="none" stroke={C.outline} strokeWidth="3" strokeLinecap="round" />
      <path d="M41 47 Q58 43 79 47" fill="none" stroke={C.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M88 40 Q102 32 117 40" fill="none" stroke={C.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M72 104 Q86 108 98 100" fill="none" stroke={C.outline} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M101 98 Q105 100 102 104" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function FaceSleepy() {
  return (
    <g>
      <path d="M44 68 Q60 80 76 68" fill="none" stroke={C.outline} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M90 66 Q102 76 114 66" fill="none" stroke={C.outline} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M48 82 Q60 86 72 82" fill="none" stroke={C.outline} strokeWidth="2" strokeLinecap="round" />
      <path d="M42 54 Q58 50 78 56" fill="none" stroke={C.outline} strokeWidth="5" strokeLinecap="round" />
      <path d="M90 52 Q102 47 116 51" fill="none" stroke={C.outline} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="84" cy="106" rx="9" ry="6" fill={C.mouthInterior} stroke={C.outline} strokeWidth="3" />
      <circle className="ronnie-snot" cx="93" cy="94" r="5" fill={C.eyeWhite} fillOpacity="0.55" stroke={C.outline} strokeWidth="2" />
      <text className="ronnie-z" x="128" y="32" fontSize="13" fontWeight="800" fill={C.sleepyZ} stroke={C.outline} strokeWidth="0.8" style={{ ...FONT, paintOrder: 'stroke' }}>z</text>
      <text className="ronnie-z ronnie-z-offset" x="138" y="20" fontSize="18" fontWeight="800" fill={C.sleepyZ} stroke={C.outline} strokeWidth="0.8" style={{ ...FONT, paintOrder: 'stroke' }}>Z</text>
    </g>
  );
}
