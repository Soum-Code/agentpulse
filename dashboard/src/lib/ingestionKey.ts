/** What the Settings page may show as a project's ingestion key.
 *
 * A key is shown only when it has the shape the API issues
 * (backend/app/services/api_keys.py: `ap_live_<12 hex>_<secret>`). Anything else
 * is withheld with the reason, because a key-shaped string the API has never
 * heard of is worse than no key: it gets copied, pasted into an SDK, and answers
 * 401. Two such strings have existed in this app -- the early client-side
 * generator (`ap_live_<slug>_<8 base36>`) and the Firestore fallback
 * `ap_live_<document id>` -- and neither matches the issued shape.
 *
 * This checks shape, not validity: only the API can say whether a key is still
 * accepted (it may have been revoked).
 */

const ISSUED_KEY_SHAPE = /^ap_live_[0-9a-f]{12}_[A-Za-z0-9_-]+$/;

export interface IngestionKeyView {
  /** The key to display and copy, or null when there is none to show. */
  key: string | null;
  /** Why there is no key; null when there is one. */
  reason: string | null;
}

export function ingestionKeyView(
  project: { apiKey?: string | null } | null | undefined,
): IngestionKeyView {
  if (!project) {
    return {
      key: null,
      reason: 'No project selected. Sign in and pick or create a project to get an ingestion key.',
    };
  }
  const stored = project.apiKey?.trim();
  if (!stored) {
    return {
      key: null,
      reason: 'No key is stored for this project. Create a new project to have the API issue one.',
    };
  }
  if (!ISSUED_KEY_SHAPE.test(stored)) {
    return {
      key: null,
      reason:
        'The key stored for this project was not issued by the AgentPulse API, so the API will not recognise it. Create a new project to get a working key.',
    };
  }
  return { key: stored, reason: null };
}
