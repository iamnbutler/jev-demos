import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Health } from "../../shared/api";

type HealthState = { health: Health | null; error: string | null };
const HealthContext = createContext<HealthState>({ health: null, error: null });

export function HealthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HealthState>({ health: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The local API server is unavailable.");
        setState({ health: await response.json(), error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            health: null,
            error: error instanceof Error ? error.message : "Cannot reach local API.",
          });
      });
    return () => controller.abort();
  }, []);
  return <HealthContext.Provider value={state}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  return useContext(HealthContext);
}
