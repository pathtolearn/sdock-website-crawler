export type StopReason =
  | "max_runtime_reached"
  | "max_pages_reached"
  | "max_results_reached"
  | "max_idle_cycles_reached"
  | "queue_drained";

export type StopPolicyState = {
  startedAtMs: number;
  nowMs: number;
  maxRuntimeSeconds: number;
  processedPages: number;
  maxPages: number;
  emittedResults: number;
  maxResults: number;
  idleCycles: number;
  maxIdleCycles: number;
  queueDrainedIdleThreshold?: number;
};

export function evaluateStopReason(state: StopPolicyState): StopReason | null {
  const elapsedMs = Math.max(0, state.nowMs - state.startedAtMs);
  if (elapsedMs >= state.maxRuntimeSeconds * 1000) {
    return "max_runtime_reached";
  }
  if (state.processedPages >= state.maxPages) {
    return "max_pages_reached";
  }
  if (state.emittedResults >= state.maxResults) {
    return "max_results_reached";
  }
  if (state.idleCycles >= state.maxIdleCycles) {
    return "max_idle_cycles_reached";
  }
  const queueDrainedThreshold = state.queueDrainedIdleThreshold ?? 2;
  if (state.idleCycles >= queueDrainedThreshold) {
    return "queue_drained";
  }
  return null;
}
