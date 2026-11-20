/** Search: how sure a hit is (from its fused rank score), and how many store reads run at once. */

/** RRF score at or above which a hit is a strong match. */
export const SCORE_HIGH = 0.025;
/** RRF score at or above which a hit is a fair match. */
export const SCORE_MEDIUM = 0.012;
/** Store reads run at once when several meetings are loaded (bounds open file handles). */
export const IO_CONCURRENCY = 5;
