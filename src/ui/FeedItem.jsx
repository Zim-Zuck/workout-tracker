import { useState } from 'react';
import { Flame } from 'lucide-react';
import GlassCard from './GlassCard.jsx';
import Avatar from './Avatar.jsx';
import Skeleton, { SkeletonText } from './Skeleton.jsx';
import { eventStyle, TONE_CLASS } from './feedRegistry.js';
import { PrimaryButton } from './Button.jsx';

// One line of community activity.
//
// The whole card is one sentence, one figure and a timestamp. A feed you read
// between sets is one you can take in without stopping, so there is no second
// paragraph, no preview image and no nested card. Everything that varies by
// event type — icon, colour, how loud the card is — comes from feedRegistry.js,
// which is why a new event type needs no change in here.
export default function FeedItem({
  event,            // { id, event_type, created_at, reaction_count, ... }
  actor,            // profile-shaped: { display_name, username, avatar_url }
  headline,         // one human sentence, built by services/communityEvents.js
  detail = null,    // at most one supporting figure ("104 kg × 5")
  timestamp,        // pre-formatted relative time ("2h")
  reacted = false,
  onReact,
  action = null,    // e.g. an inline Accept for a challenge aimed at you
  grouped = null,   // e.g. "and 2 others" — see FeedGroup below
  onOpenActor,
  loading = false
}) {
  const [pulse, setPulse] = useState(false);
  if (loading) return <FeedItemSkeleton />;

  const { icon: Icon, tone, prominence } = eventStyle(event.event_type);
  const raised = prominence === 'raised';

  const cheer = () => {
    if (!reacted) { setPulse(true); setTimeout(() => setPulse(false), 220); }
    onReact?.();
  };

  const body = (
    <div className="flex items-start gap-md">
      {onOpenActor ? (
        <button
          type="button"
          onClick={onOpenActor}
          aria-label={actor?.display_name || actor?.username || 'Profile'}
          className="shrink-0 w-tap h-tap -ml-xs flex items-center justify-center rounded-full
                     transition-opacity duration-fast ease-out active:opacity-70"
        >
          <Avatar profile={actor} size={36} />
        </button>
      ) : (
        <Avatar profile={actor} size={36} className="shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-sm">
          <Icon size={15} strokeWidth={2.2} className={`mt-xxs shrink-0 ${TONE_CLASS[tone]}`} />
          <p className={`flex-1 min-w-0 text-label font-regular ${raised ? 'text-ink' : 'text-ink-secondary'}`}>
            <span className={raised ? 'font-semibold' : ''}>{headline}</span>
            {grouped && <span className="text-ink-tertiary"> {grouped}</span>}
          </p>
          <time className="shrink-0 text-micro font-semibold tracking-normal text-ink-tertiary tabular">
            {timestamp}
          </time>
        </div>

        {detail && (
          <p className={`mt-xs ml-[23px] text-body font-semibold tabular ${TONE_CLASS[tone]}`}>{detail}</p>
        )}

        <div className="mt-sm ml-[23px] flex items-center gap-sm empty:hidden">
          {onReact && (
          <button
            type="button"
            onClick={cheer}
            aria-pressed={reacted}
            aria-label={reacted ? 'Remove your cheer' : 'Cheer this'}
            className={`inline-flex items-center gap-xs h-9 min-w-tap px-md rounded-full border
                        text-label font-semibold transition-colors duration-fast ease-out
                        ${reacted
                          ? 'bg-glass-pressed border-glass-border text-ink'
                          : 'bg-transparent border-hairline text-ink-tertiary active:bg-glass-pressed'}`}
          >
            <Flame size={14} strokeWidth={2.4} className={pulse ? 'anim-cheer' : ''} />
            {event.reaction_count > 0 && <span className="tabular">{event.reaction_count}</span>}
          </button>
          )}
          {action}
        </div>
      </div>
    </div>
  );

  // Raised events get a card; ordinary ones sit directly on the page. Cards for
  // everything is how a feed turns into a wall.
  //
  // NEITHER CARRIES ITS OWN VERTICAL SPACING. The list owns the 12px rhythm
  // between items (see ActivityFeed), because the old version put py-base on
  // plain rows and nothing at all on cards — so two milestone cards in a row
  // touched edge to edge while the rows around them sat 16px apart.
  return raised
    ? <GlassCard className="p-base">{body}</GlassCard>
    : <div className="px-base">{body}</div>;
}

// The inline Accept offered on a challenge aimed at the current user. A separate
// export so the feed never has to know what a challenge is.
export function FeedAcceptAction({ onAccept, loading }) {
  return (
    <PrimaryButton onClick={onAccept} loading={loading} className="h-9 px-lg text-label">
      Accept
    </PrimaryButton>
  );
}

// "3 friends trained today" — the rate limiter's output. Collapsing near-identical
// events is what keeps a small community's feed feeling alive rather than spammy.
export function FeedGroup({ icon: Icon, headline, actors = [], timestamp, onExpand }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full px-base py-sm flex items-center gap-md text-left rounded-row
                 transition-colors duration-fast ease-out active:bg-glass-pressed"
    >
      <span className="flex -space-x-2 shrink-0">
        {actors.slice(0, 3).map((a, i) => (
          <Avatar key={i} profile={a} size={28} className="ring-1 ring-bg" />
        ))}
      </span>
      <span className="flex-1 min-w-0 flex items-center gap-sm">
        {Icon && <Icon size={15} strokeWidth={2.2} className="text-ink-tertiary shrink-0" />}
        <span className="text-label font-regular text-ink-secondary truncate">{headline}</span>
      </span>
      <time className="shrink-0 text-micro font-semibold tracking-normal text-ink-tertiary tabular">{timestamp}</time>
    </button>
  );
}

// "N new" — new activity announces itself instead of shoving the row you were
// reading out from under your thumb.
export function NewItemsPill({ count, onClick }) {
  if (!count) return null;
  return (
    <div className="sticky top-header z-20 flex justify-center pointer-events-none">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto anim-rise h-9 px-lg rounded-full shadow-pill
                   bg-primary text-on-primary text-label font-semibold
                   transition-colors duration-fast ease-out active:bg-primary-pressed"
      >
        {count} new
      </button>
    </div>
  );
}

export function FeedItemSkeleton() {
  return (
    <div className="px-base flex items-start gap-md">
      <Skeleton w={36} h={36} radius="pill" />
      <div className="flex-1">
        <SkeletonText lines={2} />
        <Skeleton w={64} h={28} radius="pill" className="mt-sm" />
      </div>
    </div>
  );
}
