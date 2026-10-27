import { describe, expect, it } from 'vitest';
import { curationLabel } from './curation';

describe('curationLabel (N4)', () => {
  it('gives no label when the risk is unknown, never SUPPORTED', () => {
    expect(curationLabel(undefined)).toBeNull();
    expect(curationLabel(null)).toBeNull();
  });

  it('labels from the measured risk', () => {
    expect(curationLabel(0.9)).toEqual({ expected_classification: 'REFUTED', is_failure: true });
    expect(curationLabel(0.5)).toEqual({ expected_classification: 'SUPPORTED', is_failure: false });
    expect(curationLabel(0)).toEqual({ expected_classification: 'SUPPORTED', is_failure: false });
  });
});
