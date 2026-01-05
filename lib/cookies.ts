/**
 * Secure cookie utilities with proper flags
 */

interface CookieOptions {
  maxAge?: number; // in seconds
  path?: string;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export function setCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): void {
  if (typeof document === 'undefined') return;

  const {
    maxAge = 24 * 60 * 60, // 24 hours default
    path = '/',
    secure = window.location.protocol === 'https:',
    sameSite = 'Strict'
  } = options;

  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `path=${path}`,
    `max-age=${maxAge}`,
    `SameSite=${sameSite}`
  ];

  if (secure) {
    parts.push('Secure');
  }

  document.cookie = parts.join('; ');
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(
    new RegExp('(^| )' + name + '=([^;]+)')
  );

  return match ? decodeURIComponent(match[2]) : null;
}

export function deleteCookie(name: string, path: string = '/'): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${name}=; path=${path}; max-age=0`;
}

// Specific helpers for our app
export function setHostToken(token: string): void {
  setCookie('hostToken', token, {
    maxAge: 7 * 24 * 60 * 60, // 7 days
    secure: true,
    sameSite: 'Strict'
  });
}

export function getHostToken(): string | null {
  return getCookie('hostToken');
}

export function clearHostToken(): void {
  deleteCookie('hostToken');
}
