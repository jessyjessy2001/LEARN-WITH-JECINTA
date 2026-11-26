import { getGoogleAccessToken } from './googleAuth';

// App session Bearer token held strictly in memory (per security policy)
let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (sessionToken) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }
  const googleToken = getGoogleAccessToken();
  if (googleToken) {
    headers.set('X-Google-Access-Token', googleToken);
  }

  const res = await fetch(path, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      const err: Error & { status?: number; payload?: unknown } = new Error(
        data.error || `Request failed (${res.status})`
      );
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data as T;
  }

  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.text()) as unknown as T;
}
