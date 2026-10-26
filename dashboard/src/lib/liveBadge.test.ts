import { describe, it, expect } from 'vitest';
import { liveBadge } from './liveBadge';

describe('liveBadge', () => {
  it('says LIVE only when refresh is on and the last poll succeeded', () => {
    expect(liveBadge(true, 'ready')).toMatchObject({ tone: 'live', label: 'LIVE \u00b7 10s' });
  });

  it('never says LIVE while the API is unreachable or answered with an error', () => {
    for (const feed of ['unreachable', 'error'] as const) {
      const b = liveBadge(true, feed);
      expect(b.tone).toBe('offline');
      expect(b.label).not.toMatch(/LIVE/);
    }
  });

  it('says CONNECTING before the first answer', () => {
    expect(liveBadge(true, 'pending')).toMatchObject({ tone: 'connecting', label: 'CONNECTING' });
  });

  it('paused wins over every feed state', () => {
    for (const feed of ['pending', 'ready', 'unreachable', 'error'] as const) {
      expect(liveBadge(false, feed)).toMatchObject({ tone: 'paused', label: 'REFRESH PAUSED' });
    }
  });
});
