// Stable, collision-resistant IDs (no crypto.randomUUID dep — some old iOS lacks it).
export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return (prefix ? prefix + '_' : '') + t + r;
}
