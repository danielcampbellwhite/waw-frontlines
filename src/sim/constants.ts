/** Real milliseconds per simulation tick at speed 1x (1 tick = 60 game minutes = 2 real seconds). */
export const REAL_MS_PER_TICK_1X = 2000;
/** Safety: never run more than this many ticks from one advance() call (remainder stays in the accumulator). */
export const MAX_TICKS_PER_ADVANCE = 96;
/** Safety: clamp a single real-time delta (e.g. after tab was backgrounded). */
export const MAX_REAL_DT_MS = 10_000;

/** Enemy land units closer than this are "in contact" and may fight. */
export const CONTACT_KM = 5;
/** Moving units will not close to within this distance of an enemy unit (they stop and fight instead). */
export const STOP_KM = 3;
/** Max friendly land combat units that may occupy one terrain cell. */
export const STACK_LIMIT = 4;
/** Artillery/air support reach (km). */
export const ARTILLERY_SUPPORT_KM = 20;
export const AIR_SUPPORT_KM = 120;
/** A battle is closed (report written) after this many rounds; fighting then restarts as a new battle if still engaged. */
export const MAX_BATTLE_ROUNDS = 36;
/** AI thinks every N ticks per nation (staggered by nation). */
export const AI_THINK_INTERVAL = 4;
export const WEATHER_EVERY_TICKS = 6;
export const SUPPLY_EVERY_TICKS = 3;
export const MAX_LOG = 1500;
export const MAX_REPORTS = 400;
