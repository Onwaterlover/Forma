// Rest timer state for the workout logger. Times are epoch milliseconds; `pausedLeft` freezes the countdown.

export interface Rest {
  endsAt: number;
  /** Seconds, for the progress bar. */
  total: number;
  /** Milliseconds left when paused; null while running. */
  pausedLeft: number | null;
}

export const startRest = (sec: number, now: number): Rest => ({ endsAt: now + sec * 1000, total: sec, pausedLeft: null });

export const restLeftMs = (r: Rest, now: number) => r.pausedLeft ?? Math.max(0, r.endsAt - now);

export const pauseRest = (r: Rest, now: number): Rest => (r.pausedLeft !== null ? r : { ...r, pausedLeft: restLeftMs(r, now) });

export const resumeRest = (r: Rest, now: number): Rest => (r.pausedLeft === null ? r : { ...r, endsAt: now + r.pausedLeft, pausedLeft: null });

/** ±seconds, paused or not. Adding time also stretches the bar; taking it away never goes below zero. */
export function adjustRest(r: Rest, sec: number, now: number): Rest {
  const total = sec > 0 ? r.total + sec : r.total;
  if (r.pausedLeft !== null) return { ...r, total, pausedLeft: Math.max(0, r.pausedLeft + sec * 1000) };
  return { ...r, total, endsAt: Math.max(now, r.endsAt + sec * 1000) };
}
