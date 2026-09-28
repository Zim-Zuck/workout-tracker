// One share path for every generated image in the app.
//
// The recap has two places you can share from — the panel in the Social tab and
// the card viewer — and they must behave identically: same detection, same
// fallback, same filename. Two copies of this logic would drift the moment one
// of them got a fix.
//
// The share sheet is the whole point of the weekly recap. A friend sees the
// card in WhatsApp, the card carries the Kun wordmark, and that is the loop.
// So this is deliberately one call away from anywhere the recap is visible.

// Web Share Level 2 (files) support. Probed with a real File because
// navigator.share existing tells you nothing about whether files are allowed —
// desktop Chrome has the former and not always the latter.
export function canShareFiles() {
  try {
    const f = new File([new Blob(['x'])], 't.png', { type: 'image/png' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch {
    return false;
  }
}

export function downloadImage(dataUrl, filename) {
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Hand the image to the OS share sheet, falling back to a download.
//
// Returns 'shared' | 'saved' | 'cancelled' so a caller can decide whether to
// say anything. A dismissed share sheet is not an error and must never produce
// a toast — the user simply changed their mind.
export async function shareImage(dataUrl, filename, { title, text } = {}) {
  if (!dataUrl) return 'cancelled';

  if (canShareFiles()) {
    try {
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return 'shared';
      }
    } catch (err) {
      // AbortError is the user dismissing the sheet. Anything else is a real
      // failure worth falling back from, but neither should throw at the UI.
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }

  downloadImage(dataUrl, filename);
  return 'saved';
}

// Where a shared card sends someone who taps the link.
//
// One constant, because this is the last step of the loop the recap exists
// for — card lands in a group chat, someone asks what that is, and the answer
// has to be one tap away. If the app ever moves, it moves here.
export const APP_URL = 'https://workout-tracker-mu-snowy.vercel.app/';

// What goes alongside the image in WhatsApp, Messages or a group chat.
//
// The link is on its own line so chat apps that linkify text find a clean URL
// rather than one glued to a date range. Instagram Stories drops share text
// entirely — the wordmark painted on the card is the fallback hook there, and
// the reason every card carries it.
export function recapShareText(chapterLabel, rangeLabel) {
  return `${chapterLabel} · ${rangeLabel} — my week on Kun Workouts\n${APP_URL}`;
}
