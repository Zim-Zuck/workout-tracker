// The three weekly recap cards, painted with the same primitives every other
// generated image in Kun uses. No second rendering system: one palette, one
// font stack, one export path.
//
// Each card is a different CHAPTER of one week, not three views of the same
// data. They are written to be legible in that order:
//
//   1. THE WEEK IN KUN   one enormous number, almost nothing else.
//   2. THE LEADERBOARD   dense, ranked, competitive.
//   3. THE GROUP RECAP   sentences, not stats — what the week was actually like.
import {
  PALETTE, FONT_DISPLAY, FONT_TEXT,
  paintBackground, drawHairline, truncate, fitFontSize, drawWordmark, drawBar,
  wrapText, drawInitial, accentShade
} from './canvasDraw.js';
import { formatWeight } from './units.js';
import { namesOf } from '../services/weeklyRecap.js';

export const CARD_W = 1080;
export const CARD_H = 1350;
const M = 72;
const R = CARD_W - M;

export const CARD_META = [
  { id: 'wrapped', label: 'The Week' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'recap', label: 'Group Recap' }
];

// Sets up a 2x-DPR canvas and returns its context. Shared so all three cards
// export at identical dimensions and crispness.
function prepare(canvas) {
  const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 2);
  canvas.width = CARD_W * dpr;
  canvas.height = CARD_H * dpr;
  canvas.style.aspectRatio = `${CARD_W} / ${CARD_H}`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return ctx;
}

function header(ctx, rangeLabel, chapter) {
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 22px ${FONT_TEXT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('KUN  ·  THIS WEEK', M, M);
  ctx.textAlign = 'right';
  ctx.fillText(String(rangeLabel || '').toUpperCase(), R, M);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (chapter) {
    ctx.fillStyle = PALETTE.faint;
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText(chapter, M, M + 44);
  }
}

// Small uppercase section label — the app's one consistent way of saying
// "a new kind of thing starts here".
function sectionLabel(ctx, text, y, color = PALETTE.muted) {
  ctx.fillStyle = color;
  ctx.font = `600 22px ${FONT_TEXT}`;
  ctx.textAlign = 'left';
  ctx.fillText(String(text).toUpperCase(), M, y);
}

function exportPng(canvas) {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Card 1 — THE WEEK IN KUN
//
// One statistic, set as large as it will go, with the winner's name underneath.
// Everything else on this card is deliberately quiet: the whole effect depends
// on there being a single thing to look at.
// ---------------------------------------------------------------------------
export function drawWrapped(canvas, recap) {
  const ctx = prepare(canvas);
  const { unit } = recap;
  paintBackground(ctx, CARD_W, CARD_H, CARD_W * 0.78, CARD_H * 0.12);
  header(ctx, recap.rangeLabel, 'CHAPTER ONE');

  if (!recap.hasData || !recap.hero) {
    drawEmpty(ctx, 'A quiet week', 'Nobody in your circle logged a session. Next week is wide open.');
    drawWordmark(ctx, CARD_W, CARD_H);
    return exportPng(canvas);
  }

  const hero = recap.hero;
  const top = hero.groups[0];
  const winners = top.members;
  const value = hero.category.format(top.value, unit);

  // Category name, small and calm, above the number.
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 30px ${FONT_TEXT}`;
  ctx.fillText(hero.category.label.toUpperCase(), M, M + 250);

  // The number. Sized to the card, not to a fixed scale — a short "5" gets to
  // be enormous, a long "128,400 kg" shrinks to fit rather than being clipped.
  const size = fitFontSize(ctx, value, CARD_W - M * 2, { weight: 700, max: 200, min: 72, step: 4 });
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
  ctx.fillText(value, M, M + 250 + size * 0.92);

  let y = M + 290 + size;

  // Whose it is. A tie prints both names — there is no winner to pick.
  const nameStr = namesOf(winners, 2);
  const nameSize = fitFontSize(ctx, nameStr, CARD_W - M * 2 - 90, { weight: 600, max: 60, min: 32, step: 2 });
  drawInitial(ctx, M + 30, y + 6, 30, winners[0].display_name || winners[0].username);
  ctx.fillStyle = PALETTE.accent;
  ctx.font = `600 ${nameSize}px ${FONT_DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(nameStr, M + 78, y + 8);
  ctx.textBaseline = 'alphabetic';

  y += 76;
  if (hero.groups.length > 1) {
    const next = hero.groups[1];
    ctx.fillStyle = PALETTE.faint;
    ctx.font = `500 26px ${FONT_TEXT}`;
    ctx.fillText(
      truncate(ctx, `${namesOf(next.members, 1)} second, ${hero.category.format(next.value, unit)}`, CARD_W - M * 2),
      M,
      y
    );
    y += 40;
  }

  // Two supporting statistics — same treatment as each other, both clearly
  // subordinate to the hero.
  y = Math.max(y + 60, CARD_H - 520);
  drawHairline(ctx, M, y - 40, R, y - 40);

  const colW = (CARD_W - M * 2) / Math.max(1, recap.supports.length || 1);
  recap.supports.forEach((s, i) => {
    const x = M + i * colW;
    const g = s.groups[0];
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText(truncate(ctx, s.category.label.toUpperCase(), colW - 20), x, y);

    ctx.fillStyle = PALETTE.text;
    const vSize = fitFontSize(ctx, s.category.format(g.value, unit), colW - 24, {
      weight: 700, max: 56, min: 28, step: 2
    });
    ctx.font = `700 ${vSize}px ${FONT_DISPLAY}`;
    ctx.fillText(s.category.format(g.value, unit), x, y + 58);

    ctx.fillStyle = PALETTE.accent;
    ctx.font = `500 24px ${FONT_TEXT}`;
    ctx.fillText(truncate(ctx, namesOf(g.members, 1), colW - 24), x, y + 96);
  });

  // Group totals — the "we did this together" line that stops the card reading
  // as purely a contest.
  const t = recap.totals;
  drawHairline(ctx, M, CARD_H - 300, R, CARD_H - 300);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `500 26px ${FONT_TEXT}`;
  ctx.textAlign = 'left';
  const people = `${t.people} of ${t.members} training`;
  ctx.fillText(
    truncate(ctx, `${people}  ·  ${t.workouts} sessions  ·  ${formatWeight(t.volume, unit, { group: true })} moved`, CARD_W - M * 2),
    M,
    CARD_H - 246
  );

  drawWordmark(ctx, CARD_W, CARD_H);
  return exportPng(canvas);
}

// ---------------------------------------------------------------------------
// Card 2 — THE LEADERBOARD
//
// The competitive chapter. Ranked rows with proportional bars, then any
// same-exercise battles. Bars are drawn relative to the leader so second place
// reads as "close" or "nowhere near" at a glance.
// ---------------------------------------------------------------------------
export function drawLeaderboard(canvas, recap) {
  const ctx = prepare(canvas);
  const { unit } = recap;
  paintBackground(ctx, CARD_W, CARD_H, CARD_W * 0.2, CARD_H * 0.1);
  header(ctx, recap.rangeLabel, 'CHAPTER TWO');

  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 76px ${FONT_DISPLAY}`;
  ctx.fillText('The Leaderboard', M, M + 170);

  if (!recap.hasData) {
    drawEmpty(ctx, 'Nothing to rank', 'No sessions were logged in your circle this week.');
    drawWordmark(ctx, CARD_W, CARD_H);
    return exportPng(canvas);
  }

  let y = M + 250;
  const maxY = CARD_H - 140;

  // Battles are what make this card Kun's rather than any app's leaderboard, so
  // when the week produced one it gets the space: the ranked categories give up
  // their third slot rather than pushing the head-to-head off the card.
  const catLimit = recap.battles.length ? 2 : 3;

  // `continue`, not `break`: if a four-way category will not fit, a two-way one
  // further down the list still can. Same "reorganize rather than overflow"
  // behaviour the progress card already uses, and it stops the card ending in
  // a band of empty space.
  for (const c of recap.categories.slice(0, catLimit)) {
    // A podium, not a register. Three places keeps each row large enough to
    // read on a phone and leaves room for a second or third category, which is
    // more interesting than a fourth row of the first one.
    const rows = c.groups.slice(0, 3);
    const need = 44 + rows.length * 62 + 34;
    if (y + need > maxY) continue;

    sectionLabel(ctx, `${c.category.emoji}  ${c.category.label}`, y);
    y += 44;

    const leader = c.groups[0].value || 1;
    for (const g of rows) {
      const label = namesOf(g.members, 2);
      const val = c.category.format(g.value, unit);

      ctx.fillStyle = g.place === 1 ? PALETTE.text : PALETTE.muted;
      ctx.font = `${g.place === 1 ? 600 : 500} 30px ${FONT_TEXT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${g.place}`, M, y + 22);
      ctx.fillText(truncate(ctx, label, CARD_W - M * 2 - 320), M + 46, y + 22);

      ctx.textAlign = 'right';
      ctx.fillStyle = g.place === 1 ? PALETTE.accent : PALETTE.muted;
      ctx.font = `600 30px ${FONT_TEXT}`;
      ctx.fillText(val, R, y + 22);
      ctx.textAlign = 'left';

      drawBar(ctx, M + 46, y + 38, CARD_W - M * 2 - 46, 6, (g.value / leader) * 100, accentShade(g.place - 1, rows.length), PALETTE.faint);
      y += 62;
    }
    y += 34;
  }

  // Exercise battles. Only ever the SAME lift against itself — see the long
  // note in weeklyRecap.js about why there is no universal strength score.
  for (const b of recap.battles) {
    const rows = b.places.slice(0, 3);
    const need = 40 + rows.length * 42 + 30;
    if (y + need > maxY) continue;

    sectionLabel(ctx, `⚔️  ${b.title}`, y, PALETTE.accent);
    y += 40;
    for (const p of rows) {
      ctx.fillStyle = p.place === 1 ? PALETTE.text : PALETTE.muted;
      ctx.font = `${p.place === 1 ? 600 : 500} 28px ${FONT_TEXT}`;
      ctx.textAlign = 'left';
      ctx.fillText(truncate(ctx, namesOf(p.members, 2), CARD_W - M * 2 - 280), M + 46, y);
      ctx.textAlign = 'right';
      ctx.fillText(p.display, R, y);
      ctx.textAlign = 'left';
      y += 42;
    }
    y += 30;
  }

  drawWordmark(ctx, CARD_W, CARD_H);
  return exportPng(canvas);
}

// ---------------------------------------------------------------------------
// Card 3 — THE GROUP RECAP
//
// Sentences rather than a table. Each block is an award title, the person, the
// number that earned it, and one line explaining it. The line is where the
// personality lives; the number underneath it is always literally true.
// ---------------------------------------------------------------------------
export function drawRecap(canvas, recap) {
  const ctx = prepare(canvas);
  paintBackground(ctx, CARD_W, CARD_H, CARD_W * 0.5, CARD_H * 0.9);
  header(ctx, recap.rangeLabel, 'CHAPTER THREE');

  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 76px ${FONT_DISPLAY}`;
  ctx.fillText('The Group Recap', M, M + 170);

  if (!recap.hasData || !recap.awards.length) {
    drawEmpty(
      ctx,
      'No awards this week',
      'Nothing in the data was unusual enough to be worth a title. That happens — it is how the odd ones stay worth having.'
    );
    drawWordmark(ctx, CARD_W, CARD_H);
    return exportPng(canvas);
  }

  let y = M + 290;
  const maxY = CARD_H - 170;
  // Three awards in a 1350px card leave real space, so the gap between blocks
  // opens up when there are few of them rather than letting the card end in a
  // void. With four or more it tightens back to a list.
  const gap = recap.awards.length <= 3 ? 74 : 34;

  for (const a of recap.awards) {
    if (y > maxY - 140) break;

    // Rules between blocks, never after the last one — a trailing hairline
    // reads as content that failed to load.
    if (y > M + 290) {
      drawHairline(ctx, M, y - gap / 2, R, y - gap / 2);
    }

    ctx.fillStyle = PALETTE.accent;
    ctx.font = `600 24px ${FONT_TEXT}`;
    ctx.textAlign = 'left';
    ctx.fillText(truncate(ctx, a.title, CARD_W - M * 2), M, y);
    y += 56;

    const name = namesOf(a.members, 2);
    const nameSize = fitFontSize(ctx, name, CARD_W - M * 2 - 90, { weight: 700, max: 56, min: 30, step: 2 });
    drawInitial(ctx, M + 26, y - 14, 26, a.members[0].display_name || a.members[0].username);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 ${nameSize}px ${FONT_DISPLAY}`;
    ctx.fillText(truncate(ctx, name, CARD_W - M * 2 - 90), M + 70, y);
    y += 42;

    if (a.stat) {
      ctx.fillStyle = PALETTE.success;
      ctx.font = `600 30px ${FONT_TEXT}`;
      ctx.fillText(truncate(ctx, a.stat, CARD_W - M * 2), M, y);
      y += 44;
    }

    if (a.line) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `500 26px ${FONT_TEXT}`;
      for (const l of wrapText(ctx, a.line, CARD_W - M * 2, 3)) {
        ctx.fillText(l, M, y);
        y += 36;
      }
    }

    y += gap;
  }

  drawWordmark(ctx, CARD_W, CARD_H);
  return exportPng(canvas);
}

function drawEmpty(ctx, title, body) {
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 64px ${FONT_DISPLAY}`;
  ctx.fillText(title, M, CARD_H / 2 - 40);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `500 28px ${FONT_TEXT}`;
  let y = CARD_H / 2 + 20;
  for (const l of wrapText(ctx, body, CARD_W - M * 2, 4)) {
    ctx.fillText(l, M, y);
    y += 42;
  }
}

export const DRAWERS = { wrapped: drawWrapped, leaderboard: drawLeaderboard, recap: drawRecap };
