import { describe, it, expect } from 'vitest';
import { consoleGate } from './consoleGate';

describe('consoleGate', () => {
  it('blocks a telemetry view with the panel until the first successful poll', () => {
    for (const feed of ['pending', 'unreachable', 'error'] as const) {
      expect(consoleGate(feed, true, false)).toEqual({ blockWithPanel: true, showStaleBanner: false });
    }
  });

  it('keeps the view and adds a stale banner when a LATER poll fails', () => {
    for (const feed of ['unreachable', 'error'] as const) {
      expect(consoleGate(feed, true, true)).toEqual({ blockWithPanel: false, showStaleBanner: true });
    }
  });

  it('shows nothing extra while everything is fine', () => {
    expect(consoleGate('ready', true, true)).toEqual({ blockWithPanel: false, showStaleBanner: false });
    expect(consoleGate('ready', true, false)).toEqual({ blockWithPanel: false, showStaleBanner: false });
  });

  it('views with their own data source are never blocked by the telemetry feed', () => {
    for (const feed of ['pending', 'ready', 'unreachable', 'error'] as const) {
      expect(consoleGate(feed, false, false).blockWithPanel).toBe(false);
    }
  });
});
