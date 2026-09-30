import { useState } from 'react';
import { Users, Trophy, Swords, WifiOff, Bell, CalendarRange, Flame, UserRound } from 'lucide-react';
import { isOnline } from '../services/supabase.js';
import {
  SegmentedPills, SegmentedTrack, PrimaryButton, TextLink, EmptyState, GlassCard, IconButton
} from '../ui/index.js';
import ActivityFeed from '../components/ActivityFeed.jsx';
import FriendsPanel from '../components/FriendsPanel.jsx';
import NotificationsPanel from '../components/NotificationsPanel.jsx';
import ChallengesPanel from '../components/ChallengesPanel.jsx';
import LeaderboardPanel from '../components/LeaderboardPanel.jsx';
import WeeklyRecapPanel from '../components/WeeklyRecapPanel.jsx';
import CommunityWeekPanel from '../components/CommunityWeekPanel.jsx';

// THE COMMUNITY TAB.
//
// This was the Friends tab, and the first question it asked a new user was "who
// do you know here?" — which, on a small app, has one answer, and it is nobody.
// It opens on the feed, so the first thing anyone sees is other people training.
// Friends did not go away; they moved from being the door to being a filter.
//
// The word on the tab bar, the heading and every string a person reads is
// "Community". The route id stays `social` because renaming a string nobody sees
// is churn.
const SECTIONS = [
  { value: 'feed', label: 'Feed' },
  { value: 'week', label: 'Week' },
  { value: 'board', label: 'Board' },
  { value: 'challenges', label: 'Challenges' }
];

export default function SocialScreen({
  auth, onSignIn, onSignUp, section, onSectionChange,
  onOpenProfile, unread, onUnreadChange, refreshToken,
  exercises, workouts, presetOpponent, onPresetUsed,
  profile, feed, onOpenSettings
}) {
  const [weekScope, setWeekScope] = useState('community');
  const [feedScope, setFeedScope] = useState('global');

  if (!auth.cloudConfigured) {
    return (
      <EmptyState
        icon={Users}
        title="Community is not available"
        body="This build has no cloud configuration, so the community and challenges are turned off. Everything else works normally."
      />
    );
  }

  if (!auth.signedIn) {
    return (
      <div className="px-base pb-nav pt-xxl flex flex-col items-center text-center">
        <span className="w-16 h-16 rounded-card bg-glass border border-glass-border
                         flex items-center justify-center mb-base text-ink">
          <Users size={28} strokeWidth={1.8} />
        </span>
        <h1 className="text-title font-semibold text-ink">One big gym</h1>
        <p className="text-label font-regular text-ink-secondary mt-sm max-w-[32ch]">
          Everyone on Kun trains together. No friend list to build first — sign up and you
          are already in it.
        </p>

        <ul className="mt-xl w-full max-w-[280px] flex flex-col gap-sm">
          <Perk icon={Flame} text="See what Kun is lifting right now" />
          <Perk icon={Swords} text="Challenge anyone to beat your PR" />
          <Perk icon={Trophy} text="Compete on the global leaderboard" />
          <Perk icon={CalendarRange} text="A weekly recap of the whole community" />
        </ul>

        <PrimaryButton className="mt-xl" onClick={onSignUp}>Create an account</PrimaryButton>
        <TextLink className="mt-sm" onClick={onSignIn}>I already have an account</TextLink>

        <p className="text-label font-regular text-ink-tertiary mt-xl max-w-[32ch]">
          Optional. Your workouts stay on this device — only milestones like records and
          streaks are shared, and you can turn that off.
        </p>

        {!isOnline() && (
          <p className="mt-base flex items-center gap-xs text-label font-regular text-ink-tertiary">
            <WifiOff size={14} /> You are offline right now.
          </p>
        )}
      </div>
    );
  }

  const isInbox = section === 'inbox';
  const isFriends = section === 'friends';

  return (
    <div className="px-base pb-nav">
      <div className="flex items-center gap-sm pt-md">
        <div className="flex-1 min-w-0">
          <SegmentedPills
            ariaLabel="Community section"
            size="sm"
            value={isInbox || isFriends ? null : section}
            onChange={onSectionChange}
            options={SECTIONS}
          />
        </div>

        {/* Friends, demoted from a tab to a door. Still one tap away, no longer
            the first thing anybody is asked about. */}
        <BadgeIconButton
          on={isFriends}
          icon={UserRound}
          label="Friends"
          onClick={() => onSectionChange(isFriends ? 'feed' : 'friends')}
        />
        <BadgeIconButton
          on={isInbox}
          icon={Bell}
          label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          badge={isInbox ? 0 : unread}
          onClick={() => onSectionChange(isInbox ? 'feed' : 'inbox')}
        />
      </div>

      {section === 'feed' && (
        <ActivityFeed
          variant="full"
          className="mt-base"
          feed={feed}
          auth={auth}
          profile={profile}
          exercises={exercises}
          workouts={workouts}
          scope={feedScope}
          onScopeChange={setFeedScope}
          onOpenProfile={onOpenProfile}
          onOpenSettings={onOpenSettings}
          onChanged={onUnreadChange}
          onSeeAll={() => onSectionChange('friends')}
        />
      )}

      {section === 'week' && (
        <div className="mt-base">
          <SegmentedTrack
            ariaLabel="Week scope"
            value={weekScope}
            onChange={setWeekScope}
            options={[{ value: 'community', label: 'Community' }, { value: 'friends', label: 'Friends' }]}
          />
          <div className="mt-md">
            {weekScope === 'community'
              ? <CommunityWeekPanel onOpenProfile={onOpenProfile} refreshToken={refreshToken} />
              : <WeeklyRecapPanel onOpenProfile={onOpenProfile} refreshToken={refreshToken} />}
          </div>
        </div>
      )}

      {section === 'board' && (
        <div className="mt-base">
          <LeaderboardPanel
            onOpenProfile={onOpenProfile}
            refreshToken={refreshToken}
            profile={profile}
            onOpenSettings={onOpenSettings}
          />
        </div>
      )}

      {section === 'challenges' && (
        <div className="mt-base">
          <ChallengesPanel
            myId={auth.userId}
            exercises={exercises}
            workouts={workouts}
            refreshToken={refreshToken}
            onChanged={onUnreadChange}
            presetOpponent={presetOpponent}
            onPresetUsed={onPresetUsed}
          />
        </div>
      )}

      {isFriends && (
        <div className="mt-base">
          <FriendsPanel
            myId={auth.userId}
            onOpenProfile={onOpenProfile}
            onChanged={onUnreadChange}
            refreshToken={refreshToken}
          />
        </div>
      )}

      {isInbox && (
        <div className="mt-base">
          <NotificationsPanel
            onOpenProfile={onOpenProfile}
            onRead={onUnreadChange}
            refreshToken={refreshToken}
          />
        </div>
      )}
    </div>
  );
}

function BadgeIconButton({ on, icon: Icon, label, badge = 0, onClick }) {
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={on}
        className={`w-tap h-tap rounded-full border flex items-center justify-center
                    transition-colors duration-fast ease-out
                    ${on
                      ? 'bg-primary text-on-primary border-transparent'
                      : 'bg-glass text-ink-secondary border-glass-border active:bg-glass-pressed'}`}
      >
        <Icon size={18} strokeWidth={2} />
      </button>
      {badge > 0 && (
        <span className="absolute top-0 right-0 min-w-5 h-5 px-xs rounded-full bg-primary text-on-primary
                         text-micro font-semibold tracking-normal flex items-center justify-center pointer-events-none">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </span>
  );
}

function Perk({ icon: Icon, text }) {
  return (
    <li className="flex items-center gap-md text-label font-regular text-ink-secondary text-left">
      <span className="w-9 h-9 rounded-control bg-glass-inset border border-glass-inset-border
                       flex items-center justify-center shrink-0 text-ink">
        <Icon size={15} strokeWidth={2} />
      </span>
      {text}
    </li>
  );
}
