import type { TurnLifecycleEvent, TurnLifecycleStage } from "./types";

export function createLifecycleTracker() {
  const lifecycle: TurnLifecycleEvent[] = [];

  function push(stage: TurnLifecycleStage, metadata?: Record<string, unknown>) {
    lifecycle.push({
      stage,
      at: new Date().toISOString(),
      ...(metadata ? { metadata } : {})
    });
  }

  return {
    push,
    getEvents: () => lifecycle
  };
}

