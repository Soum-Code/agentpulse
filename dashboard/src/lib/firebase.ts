import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  User
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  Firestore
} from 'firebase/firestore';
// The applet config file is generated per-environment and is not committed, so
// this module must work without it. The values below are the provisioned
// project's, and a Firebase web config is public by design -- it identifies the
// project rather than authorising anything. What actually protects the data is
// firestore.rules.
const firebaseConfigJson: Record<string, string | undefined> = {};
import { TelemetryProject } from '../types';
import { api } from './api';
import { keyPrefixOf } from './ingestionKey';
import { projectFromDoc } from './projectDoc';

// Fallback config matching provisioned project
export const firebaseConfig = {
  projectId: firebaseConfigJson.projectId || "gen-lang-client-0816544069",
  appId: firebaseConfigJson.appId || "1:1070360582917:web:8c0825fe3eb886644b356c",
  apiKey: firebaseConfigJson.apiKey || "AIzaSyB-0i9UicLefCXJmUcP2vU0-DDdOYF1nS0",
  authDomain: firebaseConfigJson.authDomain || "gen-lang-client-0816544069.firebaseapp.com",
  firestoreDatabaseId: firebaseConfigJson.firestoreDatabaseId || "ai-studio-agentpulse-0ae4b515-7567-498a-845a-fb9cb589acce",
  storageBucket: firebaseConfigJson.storageBucket || "gen-lang-client-0816544069.firebasestorage.app",
  messagingSenderId: firebaseConfigJson.messagingSenderId || "1070360582917"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export { onAuthStateChanged };
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore with custom databaseId if configured
export const db: Firestore =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

/**
 * Sync user profile to Firestore `/users/{uid}`
 */
export async function syncUserProfile(user: User) {
  try {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || (user.isAnonymous ? 'Guest Explorer' : 'Engineer'),
        photoURL: user.photoURL || '',
        isAnonymous: user.isAnonymous,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      });
    } else {
      await updateDoc(userRef, {
        lastActiveAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('Could not sync user profile to Firestore:', err);
  }
}

/**
 * Sign in with Google Popup with graceful fallback
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await syncUserProfile(result.user);
  return result.user;
}

/**
 * Sign in Anonymously for fast, seamless exploration
 */
export async function signInAsGuest(): Promise<User> {
  const result = await signInAnonymously(auth);
  await syncUserProfile(result.user);
  return result.user;
}

/**
 * Sign in with Email & Password
 */
export async function signInWithEmail(email: string, pass: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  await syncUserProfile(result.user);
  return result.user;
}

/**
 * Register with Email & Password
 */
export async function registerWithEmail(email: string, pass: string, name?: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (name) {
    await updateProfile(result.user, { displayName: name });
  }
  await syncUserProfile(result.user);
  return result.user;
}

/**
 * Sign Out
 */
export async function logOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Project Management in Firestore
 *
 * What is stored: name, description, environment, owner, counters, and two NON-secret identifiers
 * of the project's ingest key (keyId, keyPrefix). What is never stored: the key itself. The API
 * shows the full key exactly once, at creation, and keeps only a hash; this file keeps that one
 * copy in `sessionKeys`, in memory, for as long as the tab lives. A reload loses it, on purpose.
 * firestore.rules refuses a write that carries an `apiKey` field, as a second line of defence.
 */
const sessionKeys = new Map<string, string>();

export async function createTelemetryProject(
  userId: string,
  projectData: {
    name: string;
    description?: string;
    environment: 'production' | 'staging' | 'development';
  }
): Promise<TelemetryProject> {
  // The key comes from the backend, which is the only thing that can issue one it will later accept.
  // (An earlier version generated a key-shaped string in the browser; the API rejected it with 401.)
  const issued = await api.createApiKey(userId, projectData.name);
  // The API's own `prefix` field is a display string ("ap_live_<hex>..."); the 12-hex lookup part
  // is cut from the key itself.
  const keyPrefix = keyPrefixOf(issued.key) ?? undefined;

  const createdAt = new Date().toISOString();
  let docId: string;
  try {
    const docRef = await addDoc(collection(db, 'projects'), {
      name: projectData.name,
      description: projectData.description || '',
      environment: projectData.environment,
      ownerId: userId,
      keyId: issued.id,
      keyPrefix,
      createdAt,
      agentCount: 0,
      traceCount: 0
    });
    docId = docRef.id;
  } catch (err) {
    // The key now exists on the API with nothing pointing at it, and the only copy is about to be
    // lost. Revoke it so it cannot become an orphaned live credential.
    await api.revokeApiKey(userId, issued.id).catch(() => undefined);
    throw err;
  }

  sessionKeys.set(docId, issued.key);
  return {
    id: docId,
    name: projectData.name,
    description: projectData.description,
    environment: projectData.environment,
    ownerId: userId,
    apiKey: issued.key,
    keyId: issued.id,
    keyPrefix,
    createdAt,
    agentCount: 0,
    traceCount: 0
  };
}

export function subscribeToUserProjects(
  userId: string,
  callback: (projects: TelemetryProject[]) => void,
  onError?: (error: Error) => void
) {
  const q = query(collection(db, 'projects'), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const projs: TelemetryProject[] = snapshot.docs.map((docSnap) => {
        const { project, legacyKey } = projectFromDoc(
          docSnap.id,
          docSnap.data(),
          sessionKeys.get(docSnap.id)
        );
        if (legacyKey) {
          // A document written by an older version holds the key in plaintext. Keep it for this
          // session and remove it from Firestore, leaving the prefix so the project still shows
          // which key it uses. Failure is harmless: the scrub is retried on the next snapshot.
          sessionKeys.set(docSnap.id, legacyKey);
          updateDoc(docSnap.ref, {
            apiKey: deleteField(),
            keyPrefix: keyPrefixOf(legacyKey)
          }).catch((err) => console.warn('Could not remove the stored key from the project:', err));
        }
        return project;
      });
      callback(projs);
    },
    (err) => {
      console.error('Projects subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Deletes a project and revokes its ingest key, so deleting a project really ends the access it
 * granted. The key is revoked FIRST: if revoking fails the project is kept (and the error thrown),
 * rather than deleted with a live key nothing can reach any more.
 */
export async function deleteTelemetryProject(projectId: string): Promise<void> {
  const ref = doc(db, 'projects', projectId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const { project } = projectFromDoc(projectId, snap.data());
    let keyId = project.keyId;
    if (keyId === undefined && project.keyPrefix) {
      // Projects created before keyId was stored: find the key by its public prefix.
      const { keys } = await api.listApiKeys(project.ownerId);
      keyId = keys.find((k) => k.prefix === `ap_live_${project.keyPrefix}…`)?.id;
    }
    if (keyId !== undefined) {
      try {
        await api.revokeApiKey(project.ownerId, keyId);
      } catch (err) {
        // 404 = the API has no such key for this owner (already gone): nothing left to revoke.
        if ((err as { status?: number }).status !== 404) throw err;
      }
    }
  }
  sessionKeys.delete(projectId);
  await deleteDoc(ref);
}
