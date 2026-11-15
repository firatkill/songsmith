// Budget guard for live runs (INF-15). Money is integer micro-USD.
export class BudgetExceededError extends Error {
  constructor(
    readonly spentMicroUsd: number,
    readonly limitMicroUsd: number,
  ) {
    super('Budget would be exceeded; the run stopped before the next call');
  }
}

export function usdToMicro(usd: number) {
  if (!Number.isFinite(usd) || usd <= 0)
    throw new Error('--budget-usd must be a positive number');
  return Math.floor(usd * 1_000_000);
}

// Before each call, reserve the estimate (the largest cost seen so far, or the
// configured first-call estimate). The call runs only if spent + estimate fits.
export function createBudget(
  limitMicroUsd: number,
  firstEstimateMicroUsd: number,
) {
  let spent = 0;
  let estimate = firstEstimateMicroUsd;
  return {
    beforeCall() {
      if (spent + estimate > limitMicroUsd)
        throw new BudgetExceededError(spent, limitMicroUsd);
    },
    record(costMicroUsd: number | null) {
      // Unknown cost counts as the current estimate so the guard stays conservative.
      const cost = costMicroUsd ?? estimate;
      spent += cost;
      estimate = Math.max(estimate, cost);
    },
    get spentMicroUsd() {
      return spent;
    },
  };
}
export type Budget = ReturnType<typeof createBudget>;
