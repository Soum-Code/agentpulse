import { describe, it, expect } from 'vitest';
import { datum, DatumStatus, datumFromFeed, feedFromError, API_SERVICE, Feed } from './stateModel';

describe('stateModel', () => {
  it('creates measured datums with exact value', () => {
    const d = datum.measured(0.35);
    expect(d.status).toBe<DatumStatus>('measured');
    expect(d.value).toBe(0.35);
  });

  it('creates pending datums with reason', () => {
    const d = datum.pending('Worker evaluating...');
    expect(d.status).toBe<DatumStatus>('pending');
    expect(d.reason).toBe('Worker evaluating...');
  });

  it('creates unmeasured datums with mandatory reason', () => {
    const d = datum.unmeasured('not exposed by the API yet');
    expect(d.status).toBe<DatumStatus>('unmeasured');
    expect(d.reason).toBe('not exposed by the API yet');
  });

  it('creates unreachable datums with service and start command', () => {
    const d = datum.unreachable(
      'Chat service (port 8100)',
      'uvicorn demo.chat_server:app --port 8100'
    );
    expect(d.status).toBe<DatumStatus>('unreachable');
    expect(d.service).toBe('Chat service (port 8100)');
    expect(d.instruction).toBe('uvicorn demo.chat_server:app --port 8100');
  });

  it('creates error datums with backend error message', () => {
    const d = datum.error('Model failed: 502 Bad Gateway');
    expect(d.status).toBe<DatumStatus>('error');
    expect(d.error).toBe('Model failed: 502 Bad Gateway');
  });
});

describe('feeds', () => {
  const ready: Feed = { status: 'ready' };

  it('classifies a network failure and gateway errors as unreachable', () => {
    expect(feedFromError(new TypeError('Failed to fetch')).status).toBe('unreachable');
    const gateway = Object.assign(new Error('API request failed: 502 Bad Gateway'), { status: 502 });
    expect(feedFromError(gateway).status).toBe('unreachable');
    expect(feedFromError(Object.assign(new Error('x'), { status: 504 })).status).toBe('unreachable');
  });

  it('classifies any other API answer as an error and keeps its message', () => {
    const forbidden = Object.assign(new Error('API request failed: 403 Forbidden'), { status: 403 });
    const feed = feedFromError(forbidden);
    expect(feed.status).toBe('error');
    expect(feed.message).toBe('API request failed: 403 Forbidden');
  });

  it('is pending while the feed has not answered, without reading the value', () => {
    let read = false;
    const d = datumFromFeed<number>({ status: 'pending' }, () => { read = true; return 1; }, 'why');
    expect(d.status).toBe('pending');
    expect(read).toBe(false);
  });

  it('passes unreachable and error through with their details', () => {
    const u = datumFromFeed<number>({ status: 'unreachable', message: 'down' }, () => 1, 'why');
    expect(u.status).toBe('unreachable');
    expect(u.service).toBe(API_SERVICE);
    expect(u.instruction).toContain('uvicorn');
    const e = datumFromFeed<number>({ status: 'error', message: '500 Internal' }, () => 1, 'why');
    expect(e.status).toBe('error');
    expect(e.error).toBe('500 Internal');
  });

  it('measures a real value, including zero', () => {
    expect(datumFromFeed(ready, () => 0, 'why')).toEqual({ status: 'measured', value: 0 });
    expect(datumFromFeed(ready, () => 'x', 'why').value).toBe('x');
  });

  it('turns null, undefined, NaN and Infinity into unmeasured with the reason', () => {
    for (const bad of [null, undefined, NaN, Infinity]) {
      const d = datumFromFeed<number>(ready, () => bad as number | null | undefined, 'no samples yet');
      expect(d.status).toBe('unmeasured');
      expect(d.reason).toBe('no samples yet');
    }
  });
});
