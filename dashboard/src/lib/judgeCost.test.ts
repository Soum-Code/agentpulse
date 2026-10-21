import { describe, expect, it } from 'vitest';
import { judgeCostPerSpan, monthlyJudgeCost } from './judgeCost';

describe('judge cost estimate', () => {
  it('works out to $0.0038 per span from the shown token assumptions', () => {
    // 1,200 x $2.50/M + 80 x $10/M
    expect(judgeCostPerSpan()).toBeCloseTo(0.0038, 10);
  });

  it('scales to a 30-day month', () => {
    expect(monthlyJudgeCost(50_000)).toBe(5700);
  });
});
