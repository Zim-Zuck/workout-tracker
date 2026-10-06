import BodyMap from './BodyMap.jsx';
import { FULL_BOX } from '../services/anatomy.js';

// FRONT AND BACK, TOGETHER.
//
// Used wherever the subject is a whole session rather than one exercise: the
// live header, the finish plate, a workout in History. Both figures are always
// shown, including the one that stayed dark — a leg day whose back view is empty
// is telling you something true, and hiding it would turn the diagram into a
// collage that reshapes itself every session.
//
// `stage` puts the soft radial bloom behind the pair that the finish plate uses.
// It is off by default because at header size the bloom is wider than the
// figures and just fogs the card.
export default function BodyPair({
  front = { primary: [], secondary: [] },
  back = { primary: [], secondary: [] },
  intensity = 0,
  height = 52,
  gap = 4,
  stage = false,
  label,
  className
}) {
  const stageSize = height * 1.15;

  return (
    <div
      className={className}
      role="img"
      aria-label={label || undefined}
      style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap }}
    >
      {stage && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: stageSize, height: stageSize, margin: `${-stageSize / 2}px 0 0 ${-stageSize / 2}px`,
            borderRadius: '9999px',
            background: 'radial-gradient(circle, rgba(246,238,240,.14), rgba(246,238,240,0) 65%)',
            pointerEvents: 'none'
          }}
        />
      )}
      <BodyMap view="front" box={FULL_BOX} height={height} intensity={intensity} {...front} />
      <BodyMap view="back" box={FULL_BOX} height={height} intensity={intensity} {...back} />
    </div>
  );
}
