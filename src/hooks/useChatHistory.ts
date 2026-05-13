import { useState, useEffect, useCallback } from 'react';
import type { Message } from '../types/chat';

const STORAGE_KEY = 'dispatch.chat.v1';

export function useChatHistory() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Strip stale streaming flags from any previous unclean unload.
      return parsed.map((m: Message) => ({ ...m, streaming: false }));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      if (messages.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      }
    } catch {
      // Quota errors are non-fatal — chat keeps working in memory.
    }
  }, [messages]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateById = useCallback((id: string, updater: (m: Message) => Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updater(m) } : m))
    );
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // non-fatal
    }
  }, []);

  return { messages, setMessages, addMessage, updateById, clearHistory };
}
