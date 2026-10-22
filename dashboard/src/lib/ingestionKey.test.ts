import { describe, it, expect } from 'vitest';
import { ingestionKeyView } from './ingestionKey';

// Shape of what POST /v1/keys returns: ap_live_<12 hex>_<url-safe secret>.
const ISSUED = 'ap_live_0123456789ab_Zm9vYmFyLWJhei1xdXV4X3F1dXg';

describe('ingestionKeyView', () => {
  it('shows a key with the shape the API issues', () => {
    expect(ingestionKeyView({ apiKey: ISSUED })).toEqual({ key: ISSUED, reason: null });
  });

  it('accepts a secret that itself contains "_" and "-"', () => {
    const key = 'ap_live_ffffffffffff_a_b-c_d';
    expect(ingestionKeyView({ apiKey: key }).key).toBe(key);
  });

  it('shows no key, and says why, when there is no project', () => {
    const view = ingestionKeyView(null);
    expect(view.key).toBeNull();
    expect(view.reason).toMatch(/No project selected/);
    expect(ingestionKeyView(undefined).key).toBeNull();
  });

  it('shows no key when the project has an empty or blank one', () => {
    expect(ingestionKeyView({ apiKey: '' }).key).toBeNull();
    expect(ingestionKeyView({ apiKey: '   ' }).key).toBeNull();
    expect(ingestionKeyView({ apiKey: '' }).reason).toMatch(/No key is stored/);
    expect(ingestionKeyView({}).key).toBeNull();
    expect(ingestionKeyView({ apiKey: null }).key).toBeNull();
  });

  it('withholds the placeholder the page used to show', () => {
    const view = ingestionKeyView({ apiKey: 'ap_live_948f10283c79a8e0192df' });
    expect(view.key).toBeNull();
    expect(view.reason).toMatch(/not issued/);
  });

  it('withholds the Firestore fallback ap_live_<document id>', () => {
    expect(ingestionKeyView({ apiKey: 'ap_live_Hk3jQ9xLmN2pR7sT4vWz' }).key).toBeNull();
  });

  it('withholds the early client-side generator ap_live_<slug>_<8 chars>', () => {
    expect(ingestionKeyView({ apiKey: 'ap_live_my-project_k3j9x2ab' }).key).toBeNull();
  });

  it('withholds a key with the right prefix but a non-hex lookup part', () => {
    expect(ingestionKeyView({ apiKey: 'ap_live_0123456789xy_secret' }).key).toBeNull();
    expect(ingestionKeyView({ apiKey: 'ap_live_0123456789a_secret' }).key).toBeNull();
  });

  it('trims surrounding whitespace before showing a real key', () => {
    expect(ingestionKeyView({ apiKey: `  ${ISSUED}\n` }).key).toBe(ISSUED);
  });
});
