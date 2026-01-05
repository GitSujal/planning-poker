/**
 * Safe localStorage wrapper that handles incognito mode and errors
 */

class SafeStorage {
  private available: boolean;
  private memoryStore: Map<string, string> = new Map();

  constructor() {
    this.available = this.checkAvailability();
  }

  private checkAvailability(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const testKey = '__test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('localStorage not available, using memory fallback');
      return false;
    }
  }

  getItem(key: string): string | null {
    if (this.available) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.error('localStorage.getItem failed:', e);
      }
    }
    return this.memoryStore.get(key) || null;
  }

  setItem(key: string, value: string): void {
    if (this.available) {
      try {
        localStorage.setItem(key, value);
        return;
      } catch (e) {
        console.error('localStorage.setItem failed:', e);
      }
    }
    this.memoryStore.set(key, value);
  }

  removeItem(key: string): void {
    if (this.available) {
      try {
        localStorage.removeItem(key);
        return;
      } catch (e) {
        console.error('localStorage.removeItem failed:', e);
      }
    }
    this.memoryStore.delete(key);
  }

  clear(): void {
    if (this.available) {
      try {
        localStorage.clear();
        return;
      } catch (e) {
        console.error('localStorage.clear failed:', e);
      }
    }
    this.memoryStore.clear();
  }
}

export const storage = new SafeStorage();
