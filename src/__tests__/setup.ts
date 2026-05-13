import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom in this environment doesn't provide a working localStorage
// (the --localstorage-file flag is intercepted). Provide an in-memory mock
// so hooks that use localStorage can be tested against real behaviour.
const store: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (index: number) => Object.keys(store)[index] ?? null,
};

vi.stubGlobal('localStorage', localStorageMock);
