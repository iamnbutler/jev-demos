import { useEffect, useState, useSyncExternalStore } from "react";
import { evaluate } from "../../lib/jev";
import { SemanticSearchSession, type SearchSnapshot } from "./semantic-search";

export function useSemanticSearch() {
  const [session] = useState(() => new SemanticSearchSession(evaluate));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => () => session.dispose(), [session]);
  return {
    snapshot,
    start: session.start,
    reset: session.reset,
    stop: session.stop,
    resume: session.resume,
  };
}

// This timer measures elapsed wall time only. Results are updated exclusively by real responses.
export function useSearchElapsed(snapshot: SearchSnapshot) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (snapshot.status !== "running") return;
    const interval = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(interval);
  }, [snapshot.status]);
  return (
    snapshot.elapsedMs +
    (snapshot.segmentStartedAt === null ? 0 : Math.max(0, now - snapshot.segmentStartedAt))
  );
}
