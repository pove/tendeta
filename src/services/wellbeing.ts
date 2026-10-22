/**
 * Digital well-being: counts continuous play time and asks for a gentle break
 * after 10 minutes. A pause longer than 3 minutes (or leaving the game) resets it.
 */
const LIMIT_MS = 10 * 60 * 1000;
const RESET_AFTER_MS = 3 * 60 * 1000;

let playedMs = 0;
let lastTick: number | null = null;
let dismissedAt = 0;

export function tick(now = Date.now()): void {
  if (lastTick !== null) {
    const delta = now - lastTick;
    if (delta > RESET_AFTER_MS) playedMs = 0;
    else playedMs += delta;
  }
  lastTick = now;
}

export function pause(): void {
  lastTick = null;
}

export function shouldSuggestBreak(): boolean {
  return playedMs - dismissedAt >= LIMIT_MS;
}

export function acknowledgeBreak(): void {
  dismissedAt = playedMs;
}

export function resetPlayTime(): void {
  playedMs = 0;
  dismissedAt = 0;
  lastTick = null;
}

export function playedMinutes(): number {
  return Math.floor(playedMs / 60000);
}
