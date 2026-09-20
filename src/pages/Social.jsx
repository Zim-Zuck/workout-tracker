import { Users, Trophy, Swords, WifiOff, Bell } from 'lucide-react';
import { isOnline } from '../services/supabase.js';
import FriendsPanel from '../components/FriendsPanel.jsx';
import NotificationsPanel from '../components/NotificationsPanel.jsx';
import ChallengesPanel from '../components/ChallengesPanel.jsx';
import LeaderboardPanel from '../components/LeaderboardPanel.jsx';

// Social tab shell.
//
// Phase 1 establishes the signed-out state and the segmented layout; Friends,
// Challenges and Leaderboard are filled in by later phases. The signed-out state
// is the important part of this screen — most users will see it first, and it
// has to read as an invitation rather than a wall.
export default function SocialScreen({
  auth, onSignIn, onSignUp, section, onSectionChange,
  onOpenProfile, unread, onUnreadChange, refreshToken,
  exercises, workouts, settings, presetOpponent, onPresetUsed
}) {
  if (!auth.cloudConfigured) {
    return (
      <Empty
        icon={Users}
        title="Social is not available"
        body="This build has no cloud configuration, so friends and challenges are turned off. Everything else works normally."
      />
    );
  }

  if (!auth.signedIn) {
    return (
      <div className="p-4 flex flex-col items-center text-center pt-10">
        <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
          <Users size={28} className="text-accent" />
        </div>
        <h1 className="text-xl font-bold">Train with your friends</h1>
        <p className="text-muted text-sm mt-2 max-w-xs">
          Add friends, compare lifts side by side, and challenge them to beat your PRs.
        </p>

        <ul className="mt-6 w-full max-w-xs space-y-2 text-left">
          <Perk icon={Users} text="See what your friends are lifting" />
          <Perk icon={Swords} text="Challenge a friend to beat your PR" />
          <Perk icon={Trophy} text="Friends-only leaderboard" />
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
          Optional. Your workouts stay on this device — only your profile, top lifts
          and totals are shared, with friends you accept.
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

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Segmented
            value={section}
            onChange={onSectionChange}
            options={[
              { value: 'friends', label: 'Friends' },
              { value: 'challenges', label: 'Challenges' },
              { value: 'leaderboard', label: 'Board' }
            ]}
          />
        </div>
        <button
          onClick={() => onSectionChange(isInbox ? 'friends' : 'inbox')}
          aria-label={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}
          className={`relative w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
            isInbox ? 'bg-accent text-white border-accent' : 'border-border text-muted active:bg-card'
          }`}
        >
          <Bell size={18} />
          {unread > 0 && !isInbox && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>

      {isInbox && (
        <NotificationsPanel
          onOpenProfile={onOpenProfile}
          onRead={onUnreadChange}
          refreshToken={refreshToken}
        />
      )}

      {section === 'friends' && (
        <FriendsPanel
          myId={auth.userId}
          onOpenProfile={onOpenProfile}
          onChanged={onUnreadChange}
          refreshToken={refreshToken}
        />
      )}

      {section === 'challenges' && (
        <ChallengesPanel
          myId={auth.userId}
          exercises={exercises}
          workouts={workouts}
          settings={settings}
          refreshToken={refreshToken}
          onChanged={onUnreadChange}
          presetOpponent={presetOpponent}
          onPresetUsed={onPresetUsed}
        />
      )}

      {section === 'leaderboard' && (
        <LeaderboardPanel onOpenProfile={onOpenProfile} refreshToken={refreshToken} />
      )}
    </div>
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

// Full-width segmented control, matching the inline one in Settings but sized
// for primary navigation within the tab.
export function Segmented({ value, onChange, options }) {
  return (
    <div className="flex rounded-xl bg-card border border-border overflow-hidden p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 h-9 rounded-lg text-sm font-medium transition-colors ${
            value === o.value ? 'bg-accent text-white' : 'text-muted active:bg-surface'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
