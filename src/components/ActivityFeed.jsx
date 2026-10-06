import { useCallback, useMemo, useRef, useState } from 'react';
import { Users, Swords, CloudOff, EyeOff, ChevronRight } from 'lucide-react';
import {
  GlassCard, FeedItem, FeedGroup, FeedAcceptAction, FeedItemSkeleton,
  NewItemsPill, EmptyState, SecondaryButton, TextLink, SegmentedTrack
} from '../ui/index.js';
import { presentFeed, ownAchievements, mergeOwn } from '../services/feedPresenter.js';
import { respondToChallenge } from '../services/challengesApi.js';
import { useToast } from './Toast.jsx';

// The activity feed, in two sizes.
//
//   variant="preview"  a short section at the bottom of Today
//   variant="full"     the Community tab's Feed section
//
// Same data, same rows, same registry — one component, because two would drift
// within a release and then a PR would be gold in one place and not the other.
const PREVIEW_ROWS = 4;

export default function ActivityFeed({
  variant = 'full', feed, auth, profile, exercises, workouts = [],
  scope, onScopeChange, onSeeAll, onOpenProfile, onOpenSettings, onChanged,
  className = ''
}) {
  const toast = useToast();
  const [accepting, setAccepting] = useState(null);
  const listRef = useRef(null);

  const exNames = useMemo(
    () => new Map((exercises || []).map((e) => [e.id, e.name])),
    [exercises]
  );

  // The user's own achievements ride in the same list, derived from local
  // history, so somebody who has just hit a PR sees it immediately — before any
  // publish has gone out, and even with nobody to see it but them.
  const mine = useMemo(
    () => (variant === 'preview' || scope !== 'friends'
      ? ownAchievements(workouts, exercises || [], profile)
      : []),
    [workouts, exercises, profile, variant, scope]
  );

  const signedOut = !auth?.signedIn;

  const rows = useMemo(
    () => presentFeed(mergeOwn(feed?.events || [], mine), { exNames, myId: auth?.userId }),
    [feed?.events, mine, exNames, auth?.userId]
  );

  const shown = variant === 'preview' ? rows.slice(0, PREVIEW_ROWS) : rows;

  const accept = useCallback(async (row) => {
    setAccepting(row.key);
    try {
      await respondToChallenge(row.ev.reference_id, true);
      toast('Challenge accepted', { tone: 'success' });
      onChanged?.();
      feed?.refresh?.();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setAccepting(null);
    }
  }, [toast, onChanged, feed]);

  // Pull to refresh. Only arms at the very top of the scroller and only for a
  // deliberate downward drag, so it can never fire while somebody is flicking
  // back up through the list.
  const pull = useRef({ y: 0, armed: false });
  const [pullPx, setPullPx] = useState(0);
  const onTouchStart = (e) => {
    const top = (listRef.current?.closest('[data-scroll]') || document.scrollingElement)?.scrollTop ?? 0;
    pull.current = { y: e.touches[0].clientY, armed: top <= 0 };
  };
  const onTouchMove = (e) => {
    if (!pull.current.armed) return;
    const dy = e.touches[0].clientY - pull.current.y;
    if (dy > 0) setPullPx(Math.min(72, dy * 0.4));
  };
  const onTouchEnd = () => {
    if (pullPx > 44) feed?.refresh?.();
    setPullPx(0);
    pull.current.armed = false;
  };

  const header = (
    <div className="flex items-center justify-between gap-sm">
      <h2 className="flex items-center gap-sm text-micro font-semibold uppercase text-ink-tertiary">
        Activity
        {/* Green only while the feed is genuinely refreshing — a permanent
            "live" dot that means nothing is worse than no dot. */}
        {(feed?.refreshing || feed?.loading) && (
          <span className="w-1.5 h-1.5 rounded-full bg-done" aria-label="Refreshing" />
        )}
      </h2>
      {variant === 'preview' && rows.length > 0 && (
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-xxs min-h-tap px-sm -mr-sm rounded-full
                     text-label font-semibold text-ink-secondary
                     transition-colors duration-fast ease-out active:text-ink"
        >
          See all <ChevronRight size={15} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );

  if (!auth?.cloudConfigured) {
    return variant === 'preview' ? null : (
      <EmptyState
        icon={Users}
        title="Community is not available"
        body="This build has no cloud configuration, so the community and challenges are turned off. Everything else works normally."
      />
    );
  }

  return (
    <section
      className={className}
      onTouchStart={variant === 'full' ? onTouchStart : undefined}
      onTouchMove={variant === 'full' ? onTouchMove : undefined}
      onTouchEnd={variant === 'full' ? onTouchEnd : undefined}
    >
      {header}

      {variant === 'full' && onScopeChange && (
        <SegmentedTrack
          className="mt-md"
          ariaLabel="Feed scope"
          value={scope}
          onChange={onScopeChange}
          options={[{ value: 'global', label: 'Everyone' }, { value: 'friends', label: 'Friends' }]}
        />
      )}

      {/* The one place a person finds out they are invisible. Quiet, always
          present while it is true, and one tap from the switch that changes it. */}
      {variant === 'full' && profile && profile.share_activity === false && (
        <GlassCard
          as="button"
          interactive
          onClick={onOpenSettings}
          className="mt-md w-full p-base flex items-start gap-sm text-left"
        >
          <EyeOff size={16} className="text-ink-tertiary shrink-0 mt-xxs" />
          <span className="min-w-0">
            <span className="block text-label font-semibold text-ink">You are not in the community</span>
            <span className="block text-label font-regular text-ink-tertiary mt-xxs">
              You can see everyone here, but your own training is hidden. Tap to change it.
            </span>
          </span>
        </GlassCard>
      )}

      {feed?.stale && (
        <p className="mt-md flex items-center gap-xs text-label font-regular text-ink-tertiary">
          <CloudOff size={14} /> Showing the last copy — you are offline.
        </p>
      )}

      {pullPx > 0 && (
        <div className="flex justify-center overflow-hidden" style={{ height: pullPx }}>
          <span className="text-micro font-semibold tracking-normal text-ink-tertiary self-end pb-xs">
            {pullPx > 44 ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      {variant === 'full' && (
        <NewItemsPill count={feed?.pendingCount || 0} onClick={feed?.showPending} />
      )}

      {/* ONE rhythm for the whole feed: 12px between every item, whatever
          shape it is. Cards and plain rows used to space themselves, which
          meant the gap between two items depended on which two they were. */}
      <div ref={listRef} className="mt-md flex flex-col gap-md">
        {feed?.loading && !shown.length && (
          <>
            <FeedItemSkeleton /><FeedItemSkeleton /><FeedItemSkeleton />
          </>
        )}

        {!feed?.loading && !shown.length && (
          <EmptyState
            icon={signedOut ? Users : Swords}
            title={signedOut ? 'Your records, and everyone else\'s' : 'Nothing here yet'}
            body={signedOut
              ? 'Your own PRs and streaks show up here as you train. Create an account and you will see the rest of Kun too.'
              : 'Add a friend or send a challenge, and their PRs, streaks and sessions start showing up here.'}
            action={
              <SecondaryButton icon={Users} onClick={onSeeAll}>
                {signedOut ? 'See the community' : 'Find people'}
              </SecondaryButton>
            }
          />
        )}

        {shown.map((row) => (
          row.kind === 'group' ? (
            <FeedGroup
              key={row.key}
              icon={row.style.icon}
              headline={row.headline}
              actors={row.actors}
              timestamp={row.timestamp}
            />
          ) : (
            <FeedItem
              key={row.key}
              event={row.ev}
              actor={row.actor}
              headline={row.headline}
              detail={row.detail}
              timestamp={row.timestamp}
              reacted={!!row.ev.my_reaction}
              onReact={row.ev.local ? undefined : () => feed?.react?.(row.ev.id)}
              onOpenActor={row.ev.local ? undefined : () => onOpenProfile?.(row.actor.id)}
              action={row.acceptable
                ? <FeedAcceptAction onAccept={() => accept(row)} loading={accepting === row.key} />
                : null}
            />
          )
        ))}
      </div>

      {variant === 'full' && feed?.hasMore && (
        <div className="mt-lg flex justify-center">
          <SecondaryButton loading={feed.paging} onClick={feed.loadMore}>
            Load more
          </SecondaryButton>
        </div>
      )}

      {variant === 'preview' && rows.length > PREVIEW_ROWS && (
        <div className="mt-md flex justify-center">
          <TextLink onClick={onSeeAll}>See all activity</TextLink>
        </div>
      )}
    </section>
  );
}
