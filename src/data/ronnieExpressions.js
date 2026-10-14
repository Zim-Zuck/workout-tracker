// Ronnie's seven faces, as data rather than as part of the component, so the
// line bank and the tests can both reason about them without pulling in JSX or
// the bundler's image imports.
//
// Each entry names the artwork file in src/assets/ronnie/ and describes what
// the face is FOR — the description is what a line should be tagged against
// (see `expression` in src/data/ronnieLines.js).
export const RONNIE_EXPRESSION_ART = {
  smug:     { file: 'ronnie-face-smug.png',    use: 'calm, knowing, teasing' },
  worried:  { file: 'ronnie-face-worried.png', use: 'stress, dread, do not quit' },
  hype:     { file: 'ronnie-face-hype.png',    use: 'finished workout, PR, big win' },
  shocked:  { file: 'ronnie-face-shocked.png', use: 'impressed or surprised' },
  flat:     { file: 'ronnie-face-flat.png',    use: 'roasts, excuses, low effort' },
  wrecked:  { file: 'ronnie-face-wrecked.png', use: 'exhausted, late night, rest' },
  shouting: { file: 'ronnie-head-loud.png',    use: 'commanding or confrontational' }
};

export const RONNIE_EXPRESSIONS = Object.keys(RONNIE_EXPRESSION_ART);
export const DEFAULT_EXPRESSION = 'smug';
