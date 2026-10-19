import type { StorageTransport } from '@goease/trip-storage';

// Dev-only one-shot faults before real I/O; never change stored bytes or fake success.
export function createQaStorageTransport(storage: StorageTransport, enabled: boolean) {
  interface Status {
    enabled: boolean;
    readArmed: boolean;
    writeArmed: boolean;
    failures: number;
    lastFailure: string;
  }
  let state: Readonly<Status> = Object.freeze({
    enabled,
    readArmed: false,
    writeArmed: false,
    failures: 0,
    lastFailure: '',
  });
  const listeners = new Set<() => void>();
  const update = (patch: Partial<typeof state>) => {
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((listener) => listener());
  };
  function consume(operation: 'read' | 'write') {
    const key = operation === 'read' ? 'readArmed' : 'writeArmed';
    if (enabled && state[key]) {
      update({ [key]: false, failures: state.failures + 1, lastFailure: operation });
      throw new Error(`QA controlled ${operation} failure before AsyncStorage I/O`);
    }
  }
  return {
    transport: {
      async getItem(key: string) {
        consume('read');
        return storage.getItem(key);
      },
      async setItem(key: string, value: string) {
        consume('write');
        return storage.setItem(key, value);
      },
    } satisfies StorageTransport,
    controls: {
      getSnapshot: () => state,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      arm(operation: 'read' | 'write') {
        if (!enabled) return false;
        update(operation === 'read' ? { readArmed: true } : { writeArmed: true });
        return true;
      },
      reset() {
        update({ readArmed: false, writeArmed: false, failures: 0, lastFailure: '' });
      },
    },
  };
}
