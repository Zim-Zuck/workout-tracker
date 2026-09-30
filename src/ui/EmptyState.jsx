// What a screen says when it has nothing to show.
//
// Every empty state names one action. "No data yet" is a dead end; "Add a friend
// and their PRs show up here" is a door. The action is a SecondaryButton, not a
// primary one — the screen's primary action belongs to the screen, not to its
// emptiest moment.
export default function EmptyState({
  icon: Icon, title, body, action = null, className = ''
}) {
  return (
    <div className={`flex flex-col items-center text-center px-lg py-xxl ${className}`}>
      {Icon && (
        <span className="w-14 h-14 rounded-card bg-glass-inset border border-glass-inset-border
                         flex items-center justify-center mb-base text-ink-secondary">
          <Icon size={24} strokeWidth={1.8} />
        </span>
      )}
      <h2 className="text-body font-semibold text-ink">{title}</h2>
      {body && <p className="text-label font-regular text-ink-secondary mt-sm max-w-[34ch]">{body}</p>}
      {action && <div className="mt-lg">{action}</div>}
    </div>
  );
}
