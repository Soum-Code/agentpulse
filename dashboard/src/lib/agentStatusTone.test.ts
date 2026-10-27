import { describe, expect, it } from 'vitest';
import { agentStatusBadgeClasses } from './agentStatusTone';

describe('agentStatusBadgeClasses (S2)', () => {
  it('paints critical rose and warning amber, never green', () => {
    expect(agentStatusBadgeClasses('critical')).toContain('rose');
    expect(agentStatusBadgeClasses('warning')).toContain('amber');
    for (const s of ['critical', 'warning', 'idle', 'running'] as const) {
      expect(agentStatusBadgeClasses(s)).not.toContain('emerald');
    }
  });

  it('keeps idle and running neutral', () => {
    expect(agentStatusBadgeClasses('idle')).toContain('neutral');
    expect(agentStatusBadgeClasses('running')).toContain('neutral');
  });
});
