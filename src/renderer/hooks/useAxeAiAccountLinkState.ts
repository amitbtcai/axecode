import { useEffect, useState } from "react";
import { readBridge } from "@/renderer/bridge";
import type { AxeAiAccountLinkState } from "@/shared/contracts";

/**
 * Live AxeAI account-link state for this desktop — subscribes to the main
 * process change channel and seeds from the current snapshot. `null` until
 * the first read resolves.
 */
export function useAxeAiAccountLinkState(): AxeAiAccountLinkState | null {
  const [linkState, setLinkState] = useState<AxeAiAccountLinkState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = readBridge().onAxeAiAccountLinkChanged(setLinkState);
    void readBridge()
      .getAxeAiAccountLinkState()
      .then((state) => {
        if (!cancelled) setLinkState(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return linkState;
}
