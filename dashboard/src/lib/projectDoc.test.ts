import { describe, it, expect } from 'vitest';
import { projectFromDoc } from './projectDoc';

const ISSUED = 'ap_live_0123456789ab_Zm9vYmFyLWJhei1xdXV4X3F1dXg';

describe('projectFromDoc', () => {
  it('never invents a key: a document without one yields apiKey undefined', () => {
    const { project, legacyKey } = projectFromDoc('Hk3jQ9xLmN2pR7sT4vWz', { name: 'P', ownerId: 'u1' });
    expect(project.apiKey).toBeUndefined();
    expect(project.keyPrefix).toBeUndefined();
    expect(legacyKey).toBeNull();
  });

  it('keeps the non-secret identifiers of a key and no secret', () => {
    const { project } = projectFromDoc('d1', { name: 'P', ownerId: 'u1', keyId: 7, keyPrefix: '0123456789ab' });
    expect(project.keyId).toBe(7);
    expect(project.keyPrefix).toBe('0123456789ab');
    expect(project.apiKey).toBeUndefined();
  });

  it('uses the session key when this session created the project', () => {
    const { project } = projectFromDoc('d1', { ownerId: 'u1', keyPrefix: '0123456789ab' }, ISSUED);
    expect(project.apiKey).toBe(ISSUED);
  });

  it('reports a plaintext key left in an old document so the caller can scrub it', () => {
    const { project, legacyKey } = projectFromDoc('d1', { ownerId: 'u1', apiKey: ISSUED });
    expect(legacyKey).toBe(ISSUED);
    expect(project.apiKey).toBe(ISSUED); // still usable for this session
    expect(project.keyPrefix).toBe('0123456789ab'); // derived, so it survives the scrub
  });

  it('ignores a stored string that is not an issued key (old generators)', () => {
    for (const bad of ['ap_live_my-project_k3j9x2ab', 'ap_live_Hk3jQ9xLmN2pR7sT4vWz', 'ap_live_swm992810a']) {
      const { project, legacyKey } = projectFromDoc('d1', { ownerId: 'u1', apiKey: bad });
      expect(legacyKey).toBeNull();
      expect(project.apiKey).toBeUndefined();
    }
  });

  it('defaults the unknown fields without NaN', () => {
    const { project } = projectFromDoc('d1', { ownerId: 'u1', agentCount: 'x', traceCount: NaN, environment: 'prod' });
    expect(project.agentCount).toBe(0);
    expect(project.traceCount).toBe(0);
    expect(project.environment).toBe('production');
    expect(project.name).toBe('Untitled Project');
  });
});
