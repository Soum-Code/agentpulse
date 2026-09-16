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
 */
export async function createTelemetryProject(
  userId: string,
  projectData: {
    name: string;
    description?: string;
    environment: 'production' | 'staging' | 'development';
  }
): Promise<TelemetryProject> {
  // The key comes from the backend, which is the only thing that can issue one
  // it will later accept.
  //
  // This used to be `Math.random().toString(36)` formatted to look like a
  // credential. It was displayed with a copy button and rejected with 401 the
  // moment anyone used it, because the API had never heard of it -- a key that
  // looks real and is not is worse than no key at all.
  const issued = await api.createApiKey(userId, projectData.name);
  const apiKey = issued.key;

  const docRef = await addDoc(collection(db, 'projects'), {
    name: projectData.name,
    description: projectData.description || '',
    environment: projectData.environment,
    ownerId: userId,
    apiKey,
    createdAt: new Date().toISOString(),
    agentCount: 0,
    traceCount: 0
  });

  return {
    id: docRef.id,
    name: projectData.name,
    description: projectData.description,
    environment: projectData.environment,
    ownerId: userId,
    apiKey,
    createdAt: new Date().toISOString(),
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
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.name || 'Untitled Project',
          description: d.description || '',
          environment: d.environment || 'production',
          ownerId: d.ownerId,
          apiKey: d.apiKey || `ap_live_${docSnap.id}`,
          createdAt: d.createdAt || new Date().toISOString(),
          agentCount: d.agentCount || 0,
          traceCount: d.traceCount || 0
        };
      });
      callback(projs);
    },
    (err) => {
      console.error('Projects subscription error:', err);
      if (onError) onError(err);
    }
  );
}

export async function deleteTelemetryProject(projectId: string): Promise<void> {
  await deleteDoc(doc(db, 'projects', projectId));
}
