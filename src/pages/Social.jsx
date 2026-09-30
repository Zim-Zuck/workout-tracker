import { useState } from 'react';
import { Users, Trophy, Swords, WifiOff, Bell, CalendarRange, Flame, UserRound } from 'lucide-react';
import { isOnline } from '../services/supabase.js';
import Segmented from '../components/Segmented.jsx';
import FriendsPanel from '../components/FriendsPanel.jsx';
import NotificationsPanel from '../components/NotificationsPanel.jsx';
import ChallengesPanel from '../components/ChallengesPanel.jsx';
import LeaderboardPanel from '../components/LeaderboardPanel.jsx';
import WeeklyRecapPanel from '../components/WeeklyRecapPanel.jsx';
import CommunityFeedPanel from '../components/CommunityFeedPanel.jsx';
import CommunityWeekPanel from '../components/CommunityWeekPanel.jsx';

// The Community tab.
//
// THE CHANGE THIS SCREEN EXISTS TO EXPRESS
// This was the Friends tab, and the first question it asked a new user was "who
// do you know here?" — which, on a small app, has one answer, and it is nobody.
// The tab now opens on the feed, so the first thing anyone sees is other people
// training. Friends did not go away; they moved from being the door to being a
// filter, which is what they should have been all along.
//
// Four sections plus two secondary entries. Friends sits beside the inbox rather
// than in the segmented control, because it is now a place you go occasionally
// rather than the place you start.

// Segmented used to be defined and exported here. It moved to components/ when
// the community panels needed it too: a component importing from a page that
// imports it back is a cycle waiting to bite. Every caller now imports it from
// there directly, so there is nothing left to re-export.

const SECTIONS = [
  { value: 'feed', label: 'Feed' },
  { value: 'week', label: 'Week' },
  { value: 'board', label: 'Board' },
  { value: 'challenges', label: 'Challenges' }
];

const WEEK_SCOPES = [
  { value: 'community', label: 'Community' },
  { value: 'friends', label: 'Friends' }
];

export default function SocialScreen({
  auth, onSignIn, onSignUp, section, onSectionChange,
  onOpenProfile, unread, onUnreadChange, refreshToken,
  exercises, workouts, presetOpponent, onPresetUsed,
  profile, onOpenSettings
}) {
  // Which week people last looked at, held here so switching sections and coming
  // back does not silently put them on the other one.
  const [weekScope, setWeekScope] = useState('community');

  if (!auth.cloudConfigured) {
    return (
      <Empty
        icon={Users}
        title="Community is not available"
        body="This build has no cloud configuration, so the community and challenges are turned off. Everything else works normally."
      />
    );
  }

  if (!auth.signedIn) {
    return (
      <div className="p-4 flex flex-col items-center text-center pt-10">
        <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
          <Users size={28} className="text-accent" />
        </div>
        <h1 className="text-xl font-bold">One big gym</h1>
        <p className="text-muted text-sm mt-2 max-w-xs">
          Everyone on Kun trains together. No friend list to build first — sign up and you
          are already in it.
        </p>

        <ul className="mt-6 w-full max-w-xs space-y-2 text-left">
          <Perk icon={Flame} text="See what Kun is lifting right now" />
          <Perk icon={Swords} text="Challenge anyone to beat your PR" />
          <Perk icon={Trophy} text="Compete on the global leaderboard" />
          <Perk icon={CalendarRange} text="A weekly recap of the whole community" />
        </ul>

        <button
          onClick={onSignUp}
          className="mt-6 h-12 px-6 rounded-xl bg-accent text-white font-semibold active:opacity-80"
        >
          Create an account
        </button>
        <button onClick={onSignIn} className="mt-2 h-11 px-4 text-sm text-muted active:text-text">
          I already have an account
        </button>

        <p className="text-[11px] text-muted mt-4 max-w-xs leading-relaxed">
          Optional. Your workouts stay on this device — only milestones like records and
          streaks are shared, and you can turn that off.
        </p>

        {!isOnline() && (
          <p className="mt-4 text-xs text-warn flex items-center gap-1">
            <WifiOff size={14} /> You are offline right now.
          </p>
        )}
      </div>
    );
  }

  const isInbox = section === 'inbox';
  const isFriends = section === 'friends';

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Segmented
            value={section}
            onChange={onSectionChange}
            options={SECTIONS}
          />
        </div>

        {/* Friends, demoted from a tab to a door. Still one tap away, no longer
            the first thing anybody is asked about. */}
        <IconButton
          on={isFriends}
          label="Friends"
          onClick={() => onSectionChange(isFriends ? 'feed' : 'friends')}
        >
          <UserRound size={18} />
        </IconButton>

        <IconButton
          on={isInbox}
          label={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}
          onClick={() => onSectionChange(isInbox ? 'feed' : 'inbox')}
          badge={isInbox ? 0 : unread}
        >
          <Bell size={18} />
        </IconButton>
      </div>

      {section === 'feed' && (
        <CommunityFeedPanel
          onOpenProfile={onOpenProfile}
          refreshToken={refreshToken}
          exercises={exercises}
          profile={profile}
          onOpenSettings={onOpenSettings}
        />
      )}

      {section === 'week' && (
        <>
          <Segmented value={weekScope} onChange={setWeekScope} options={WEEK_SCOPES} />
          {weekScope === 'community' ? (
            <CommunityWeekPanel onOpenProfile={onOpenProfile} refreshToken={refreshToken} />
          ) : (
            // Untouched by the community change: same engine, same cards, same
            // share sheet it has always had.
            <WeeklyRecapPanel onOpenProfile={onOpenProfile} refreshToken={refreshToken} />
          )}
        </>
      )}

      {section === 'board' && (
        <LeaderboardPanel
          onOpenProfile={onOpenProfile}
          refreshToken={refreshToken}
          profile={profile}
          onOpenSettings={onOpenSettings}
        />
      )}

      {section === 'challenges' && (
        <ChallengesPanel
          myId={auth.userId}
          exercises={exercises}
          workouts={workouts}
          refreshToken={refreshToken}
          onChanged={onUnreadChange}
          presetOpponent={presetOpponent}
          onPresetUsed={onPresetUsed}
        />
      )}

      {isFriends && (
        <FriendsPanel
          myId={auth.userId}
          onOpenProfile={onOpenProfile}
          onChanged={onUnreadChange}
          refreshToken={refreshToken}
        />
      )}

      {isInbox && (
        <NotificationsPanel
          onOpenProfile={onOpenProfile}
          onRead={onUnreadChange}
          refreshToken={refreshToken}
        />
      )}
    </div>
  );
}

function IconButton({ on, label, onClick, badge = 0, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`relative w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
        on ? 'bg-accent text-white border-accent' : 'border-border text-muted active:bg-card'
      }`}
    >
      {children}
      {badge > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function Perk({ icon: Icon, text }) {
  return (
    <li className="flex items-center gap-3 text-sm text-muted">
      <span className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
        <Icon size={15} className="text-accent" />
      </span>
      {text}
    </li>
  );
}

function Empty({ icon: Icon, title, body }) {
  return (
    <div className="p-4 flex flex-col items-center text-center pt-16">
      <Icon size={32} className="text-muted mb-3" />
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-muted text-sm mt-2 max-w-xs">{body}</p>
    </div>
  );
}
