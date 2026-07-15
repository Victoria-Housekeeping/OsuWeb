import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // We have a user but no token cached in memory yet (e.g. on fresh reload)
        // In this case, we'll need the user to click sign in again to get a fresh token,
        // or we can prompt them when they try to access Drive.
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Helper: Extract Folder or File ID from Google Drive URL
export function parseGoogleDriveUrl(url: string): { type: 'folder' | 'file'; id: string } | null {
  if (!url) return null;
  // Folder matchers
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (folderMatch) {
    return { type: 'folder', id: folderMatch[1] };
  }
  // File matchers
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (fileMatch) {
    return { type: 'file', id: fileMatch[1] };
  }
  const openMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (openMatch) {
    return { type: 'file', id: openMatch[1] };
  }
  // Fallback: if it's just an alphanumeric string of typical Drive ID length (25-45 chars), treat it as folder or file depending on user
  if (/^[a-zA-Z0-9-_]{25,45}$/.test(url.trim())) {
    return { type: 'folder', id: url.trim() }; // Default to folder if it's a raw ID
  }
  return null;
}

// Drive API Fetch Helpers
export async function fetchDriveMetadata(id: string, token: string): Promise<{ name: string; mimeType: string }> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Drive metadata: ${res.statusText}`);
  }
  return res.json();
}

export async function listDriveFolderFiles(folderId: string, token: string): Promise<{ id: string; name: string; mimeType: string; size?: string }[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to list Drive folder: ${res.statusText}`);
  }
  const data = await res.json();
  return data.files || [];
}

export async function downloadDriveFileBlob(fileId: string, token: string): Promise<Blob> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to download file from Drive: ${res.statusText}`);
  }
  return res.blob();
}
