// A poll that only runs while someone is looking: `poll` now, then every `ms`.
// A hidden tab skips the call but keeps the timer, so an idle tab left open
// costs nothing, and showing it again asks at once and restarts the interval
// from there rather than leaving the page stale until the next tick.
//
// `poll` is handed `live`, false once the component has gone, so an answer
// that lands after it doesn't try to set its state.

import { useEffect, useEffectEvent } from 'react';

export function useVisiblePoll(poll: (live: () => boolean) => void, ms: number): void {
  const run = useEffectEvent(poll);

  useEffect(() => {
    let alive = true;
    const live = () => alive;
    let id: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (!document.hidden) run(live);
      id = setTimeout(tick, ms);
    };
    const onVisible = () => {
      if (document.hidden) return;
      if (id) clearTimeout(id);
      tick();
    };
    tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      if (id) clearTimeout(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms]);
}
