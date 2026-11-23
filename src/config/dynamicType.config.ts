/** Apple's iOS Dynamic Type (HIG Typography, 2026): each text style's size and leading at every standard Text Size, and
 *  SF Pro's tracking per size. iPhone type follows the phone's Text Size through these; a Mac keeps tokens.css. */

/** The standard Text Size settings, smallest to largest (the accessibility sizes use the largest). */
export type ContentSize = 'xSmall' | 'small' | 'medium' | 'large' | 'xLarge' | 'xxLarge' | 'xxxLarge';

/** Apple's text styles Roci uses. */
type AppleStyle = 'largeTitle' | 'title1' | 'title2' | 'title3' | 'body' | 'subhead' | 'footnote';

/** [size, leading] in points, per style, per Text Size. */
const SIZES: Record<ContentSize, Record<AppleStyle, readonly [number, number]>> = {
  xSmall: { largeTitle: [31, 38], title1: [25, 31], title2: [19, 24], title3: [17, 22], body: [14, 19], subhead: [12, 16], footnote: [12, 16] },
  small: { largeTitle: [32, 39], title1: [26, 32], title2: [20, 25], title3: [18, 23], body: [15, 20], subhead: [13, 18], footnote: [12, 16] },
  medium: { largeTitle: [33, 40], title1: [27, 33], title2: [21, 26], title3: [19, 24], body: [16, 21], subhead: [14, 19], footnote: [12, 16] },
  large: { largeTitle: [34, 41], title1: [28, 34], title2: [22, 28], title3: [20, 25], body: [17, 22], subhead: [15, 20], footnote: [13, 18] },
  xLarge: { largeTitle: [36, 43], title1: [30, 37], title2: [24, 30], title3: [22, 28], body: [19, 24], subhead: [17, 22], footnote: [15, 20] },
  xxLarge: { largeTitle: [38, 46], title1: [32, 39], title2: [26, 32], title3: [24, 30], body: [21, 26], subhead: [19, 24], footnote: [17, 22] },
  xxxLarge: { largeTitle: [40, 48], title1: [34, 41], title2: [28, 34], title3: [26, 32], body: [23, 29], subhead: [21, 28], footnote: [19, 24] },
};

/** Body's size names the Text Size setting (the one fact the web view can read, through `-apple-system-body`). */
const BY_BODY_SIZE: ReadonlyArray<readonly [number, ContentSize]> = [
  [14, 'xSmall'], [15, 'small'], [16, 'medium'], [17, 'large'], [19, 'xLarge'], [21, 'xxLarge'], [23, 'xxxLarge'],
];

/** SF Pro tracking in points per size (iOS). */
const TRACKING: Readonly<Record<number, number>> = {
  11: 0.06, 12: 0, 13: -0.08, 14: -0.15, 15: -0.23, 16: -0.31, 17: -0.43, 18: -0.44, 19: -0.45, 20: -0.45, 21: -0.36,
  22: -0.26, 23: -0.1, 24: 0.07, 25: 0.15, 26: 0.22, 27: 0.29, 28: 0.38, 29: 0.4, 30: 0.4, 31: 0.39, 32: 0.41, 33: 0.4,
  34: 0.4, 35: 0.38, 36: 0.37, 37: 0.36, 38: 0.37, 39: 0.38, 40: 0.37,
};

/** Which Apple style each Roci type token takes (tokens.css names: `--fs-<token>`, `--lh-<token>`, `--tr-<token>`). */
const TOKEN_STYLE: Readonly<Record<string, AppleStyle>> = {
  'large-title': 'largeTitle',
  title1: 'title1',
  title2: 'title2',
  greeting: 'title2',
  title3: 'title3',
  body: 'body',
  reading: 'body',
  prose: 'body',
  callout: 'subhead',
  subheadline: 'footnote',
  section: 'footnote',
  segment: 'footnote',
};

/** Long-form text (a reply's paragraphs and lists) is Body with roomier leading: Apple's Body leading (22 on 17) is set for
 *  single lines (rows, buttons) and reads cramped over a paragraph. Its line is this many times its size. */
const LOOSE_LEADING: Readonly<Record<string, number>> = { prose: 1.5 };

/** The Text Size setting whose Body is `bodyPx` (the nearest standard one at or below it; accessibility sizes → xxxLarge). */
export function contentSizeFor(bodyPx: number): ContentSize {
  return BY_BODY_SIZE.reduce<ContentSize>((found, [size, name]) => (bodyPx >= size ? name : found), 'xSmall');
}

/** The CSS custom properties for one Text Size setting: size, leading and tracking for every Roci type token. */
export function typeTokensFor(size: ContentSize): Record<string, string> {
  return Object.fromEntries(Object.entries(TOKEN_STYLE).flatMap(([token, style]) => {
    const [px, appleLeading] = SIZES[size][style];
    const loose = LOOSE_LEADING[token];
    const leading = loose ? Math.round(px * loose) : appleLeading;
    return [[`--fs-${token}`, `${px}px`], [`--lh-${token}`, `${leading}px`], [`--tr-${token}`, `${TRACKING[px] ?? 0}px`]];
  }));
}
