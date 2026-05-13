import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatHistory } from '../hooks/useChatHistory';
import type { Message } from '../types/chat';

const STORAGE_KEY = 'dispatch.chat.v1';

const makeMsg = (overrides?: Partial<Message>): Message => ({
  id: 'test-id-' + Math.random(),
  role: 'user',
  content: 'Hello',
  timestamp: Date.now(),
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useChatHistory', () => {
  it('starts with empty messages when localStorage is empty', () => {
    const { result } = renderHook(() => useChatHistory());
    expect(result.current.messages).toEqual([]);
  });

  it('hydrates from localStorage on mount', () => {
    const stored: Message[] = [
      makeMsg({ id: 'abc', content: 'Persisted message', streaming: true }),
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useChatHistory());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Persisted message');
    // streaming flag should be stripped on hydration
    expect(result.current.messages[0].streaming).toBe(false);
  });

  it('persists messages to localStorage after addMessage', () => {
    const { result } = renderHook(() => useChatHistory());
    const msg = makeMsg({ id: 'new-msg', content: 'Test message' });

    act(() => {
      result.current.addMessage(msg);
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe('Test message');
  });

  it('clearHistory wipes state and localStorage', () => {
    const { result } = renderHook(() => useChatHistory());

    act(() => {
      result.current.addMessage(makeMsg({ id: '1' }));
      result.current.addMessage(makeMsg({ id: '2' }));
    });

    expect(result.current.messages).toHaveLength(2);

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('handles malformed localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json');
    const { result } = renderHook(() => useChatHistory());
    expect(result.current.messages).toEqual([]);
  });

  it('updateById patches the matching message', () => {
    const { result } = renderHook(() => useChatHistory());
    const msg = makeMsg({ id: 'patch-me', content: 'original' });

    act(() => {
      result.current.addMessage(msg);
    });

    act(() => {
      result.current.updateById('patch-me', () => ({ content: 'updated' }));
    });

    expect(result.current.messages[0].content).toBe('updated');
  });
});
