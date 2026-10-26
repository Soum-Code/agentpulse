/**
 * Turns a Firestore project document into the console's TelemetryProject, and decides what must
 * never be read back: a plaintext ingest key.
 *
 * Kept free of the Firebase SDK so it can be unit-tested. lib/firebase.ts does the reads and writes.
 */
import type { TelemetryProject } from '../types';
import { keyPrefixOf } from './ingestionKey';

export interface ProjectDocRead {
  project: TelemetryProject;
  /**
   * A plaintext key found in the document. Older versions of this console stored the key in
   * Firestore. The caller keeps it in memory for this session only and removes it from the
   * document, so that Firestore stops holding a credential.
   */
  legacyKey: string | null;
}

/**
 * `sessionKey` is the full key if this browser session created the project (memory only).
 * Nothing here ever invents a key: when there is none, `apiKey` is simply undefined.
 */
export function projectFromDoc(
  id: string,
  data: Record<string, unknown>,
  sessionKey?: string,
): ProjectDocRead {
  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  // Only a key the API actually issued counts as a stored key; anything else is ignored, not shown.
  const storedKey = str(data.apiKey).trim();
  const legacyKey = keyPrefixOf(storedKey) ? storedKey : null;
  const keyPrefix = str(data.keyPrefix) || keyPrefixOf(legacyKey) || undefined;

  const environment = data.environment;
  return {
    legacyKey,
    project: {
      id,
      name: str(data.name, 'Untitled Project'),
      description: str(data.description),
      environment:
        environment === 'staging' || environment === 'development' ? environment : 'production',
      ownerId: str(data.ownerId),
      apiKey: sessionKey ?? legacyKey ?? undefined,
      keyId: typeof data.keyId === 'number' ? data.keyId : undefined,
      keyPrefix,
      createdAt: str(data.createdAt, new Date(0).toISOString()),
      agentCount: num(data.agentCount),
      traceCount: num(data.traceCount),
    },
  };
}
