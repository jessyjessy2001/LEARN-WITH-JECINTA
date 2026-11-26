import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/meetings.space.readonly',
];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// Stored strictly in memory (never localStorage or sessionStorage)
let cachedGoogleAccessToken: string | null = null;
let cachedGoogleUser: User | null = null;

export function initGoogleAuth(
  onUpdate: (user: User | null, accessToken: string | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedGoogleAccessToken) {
      cachedGoogleUser = user;
      onUpdate(user, cachedGoogleAccessToken);
    } else if (!isSigningIn) {
      cachedGoogleAccessToken = null;
      cachedGoogleUser = null;
      onUpdate(null, null);
    }
  });
}

export async function googleWorkspaceSignIn(): Promise<{
  user: User;
  accessToken: string;
}> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in did not return an OAuth access token.');
    }
    cachedGoogleAccessToken = credential.accessToken;
    cachedGoogleUser = result.user;
    return { user: result.user, accessToken: cachedGoogleAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getGoogleAccessToken(): string | null {
  return cachedGoogleAccessToken;
}

export function clearGoogleAccessToken(): void {
  cachedGoogleAccessToken = null;
}

export function getGoogleUser(): User | null {
  return cachedGoogleUser;
}

export async function googleWorkspaceLogout(): Promise<void> {
  await auth.signOut();
  cachedGoogleAccessToken = null;
  cachedGoogleUser = null;
}
