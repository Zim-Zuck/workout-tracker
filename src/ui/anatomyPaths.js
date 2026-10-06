// THE ANATOMY ARTWORK.
//
// Ported verbatim from the Claude Design `BodyMap` component (project
// ba2134a1, files anatomy/front.svg and anatomy/back.svg). Everything lives in
// one coordinate space — viewBox `8 0 84 200`, body centred on x=50 — so a
// porthole crop is nothing more than a different viewBox.
//
// THIS IS v1 ART AND IS MEANT TO BE REPLACED. The handoff note says so: the
// paths are hand-built, not traced from an anatomy source, and a 58px porthole
// magnifies a crop of them rather than shrinking the whole figure (`abs` is
// four rounded rectangles). When design ships illustrator-grade paths, they
// keep the same region ids and the same viewBox, so replacing the two maps
// below is the entire change — no component touches these shapes by name.
//
// Each region is ONE path covering left and right together, built by mirroring
// a single half about x=50. Keeping the pair in one path is what lets a region
// be addressed as one unit ("biceps", not "biceps-l" + "biceps-r").

// Mirror every coordinate pair in a path about x=50. Matches the `mir()` helper
// in the design source; the regex pairs up `x y` arguments, which works because
// every command in these paths takes coordinates in that order.
const NUM = /(-?[\d.]+)[\s,]+(-?[\d.]+)/g;
const mirror = (d) => d.replace(NUM, (_, x, y) => `${100 - Number(x)} ${y}`);
const pair = (d) => `${d} ${mirror(d)}`;

// --- Silhouette: head, neck, torso, arms, legs. Static, never highlighted. ---
const HEAD = 'M42 11 a8 10.5 0 1 0 16 0 a8 10.5 0 1 0 -16 0Z';
const NECK = 'M45.5 19 L54.5 19 L54.5 28 L45.5 28Z';
const TORSO = 'M50 27 L55 27 C62 29 69 31 71.5 35 C70.5 42 69.5 48 68.8 54 C67.5 66 65.5 76 64 86 C64.5 94 67.5 100 68.5 106 L68.5 110 L50 110 Z';
const ARM = 'M69 40 C74 36 80 40 79.5 46 C80.5 56 81.5 66 82.3 76 C83.5 90 85 100 85.8 108 C86.5 114 87 118 86.5 123 C84.5 125 81 124.5 80 122 C79.8 116 79.8 112 80 108 C78 98 75.5 88 73.8 78 C72.5 70 71 62 70 54 C69.2 48 68.8 44 69 40 Z';
const LEG = 'M51.5 104 L68.5 104 C69.5 118 67.5 134 63.5 148 C63 153 62.5 157 62.5 160 C63.5 168 63 178 61 186 L60.5 192 C60.5 196 57 197.5 53 197 L53 188 C52 177 52.5 167 52 158 C51.5 150 51 140 51.5 130 Z';

export const SILHOUETTE = [HEAD, NECK, pair(TORSO), pair(ARM), pair(LEG)];

// --- Regions shared between the two views, so they cannot drift apart. ---
const DELT = 'M70 38 C75 35.5 80.5 40 80 47 C79.8 52 78.5 56 76.5 58 C73 55 70.5 49 69.5 43 C69.3 41 69.5 39 70 38Z';
const FOREARM = 'M74.5 80 C77.5 78.5 81 79 82.8 81 C83.8 90 85 99 85.5 106 C83.5 108 81.5 107.5 80.2 106 C78.5 98 76 90 74.5 80Z';

// 15 regions across two views. Delts are deliberately NOT split front/side/rear
// — a rear-delt fly lights the whole delt — and traps is one region, while lats
// and rhomboids are separate.
export const FRONT = {
  traps: pair('M55 25 C60 27 66 29.5 70 33 L66 36 C62 33 58 31 55 30Z'),
  delts: pair(DELT),
  chest: pair('M51.5 38 C58 36.5 65 37.5 68.5 41 C69 46 67.5 52 63 56 C58 58.5 54 57.5 51.5 55Z'),
  biceps: pair('M71 58 C74 56.5 78 58 80 61 C80.8 66 81.5 71 81.8 75 C79 76.5 76 76 74 74 C72.5 69 71.2 63 71 58Z'),
  forearms: pair(FOREARM),
  abs: pair('M51.5 59 L58 59 L58 66.5 L51.5 66.5Z M51.5 68.5 L58.2 68.5 L58.2 76.5 L51.5 76.5Z M51.5 78.5 L58 78.5 L58 86.5 L51.5 86.5Z M52 88.5 L57.5 88.5 L57 95 L52 95Z'),
  obliques: pair('M59.5 60 C63 58.5 66 60 67 62 C66.5 72 65 82 63.5 90 C62 92 60.5 92.5 59.5 92Z'),
  quads: pair('M57 110 C62 108 66 110 67 113 C67.5 124 65 136 61.5 145 C59 146.5 57.5 146 56 144 C57 133 57.5 120 57 110Z M52.5 124 C55 122 55.5 124 55.5 130 C55.5 138 55 143 54 146 C52.5 143 52 134 52.5 124Z'),
  calves: pair('M60 158 C62.5 160 63 168 61.5 180 C60 183 58 183 57 181 C57 172 58 164 60 158Z')
};

export const BACK = {
  traps: pair('M50 24 L54.5 25 C60 27 66 30 71 34.5 C68 38 63 41 58 43 L50 43Z'),
  delts: pair(DELT),
  rhomboids: pair('M51.5 46 L58.5 44.5 C59 50 58 55 55.5 59 L51.5 62Z'),
  lats: pair('M59.5 49 C63.5 47 67.3 49 68 53 C67.2 64 64.5 75 60 87 C58.7 88 57.3 87 57 85 C57.3 74 58.5 60 59.5 49Z'),
  triceps: pair('M71 57 C75 55 79 57 80.5 61 C81.5 67 82 72 82.3 77 C79 78.5 76 78 74 76 C72 70 71 63 71 57Z'),
  forearms: pair(FOREARM),
  lower_back: pair('M51.5 70 L55.3 70 C56.2 78 56.2 88 55 96 L51.5 98Z'),
  glutes: pair('M51.5 98 C58 94 66 96 68 102 C69 109 66 115 60 117 C55 117.5 52.5 114 51.5 110Z'),
  hamstrings: pair('M53.5 121 C58 119 64 119 67 121 C67 130 65 140 62 148 C59 149.5 56.5 149 54.5 147 C53 138 53 128 53.5 121Z'),
  calves: pair('M55 154 C58 151 62 153 62.5 158 C63 166 61.5 174 59.5 180 C57.5 181 55.5 180 54.5 176 C53.5 168 53.5 160 55 154Z')
};

// The whole figure. A porthole passes a crop of it instead.
export const FULL_BOX = '8 0 84 200';
