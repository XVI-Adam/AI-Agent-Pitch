import { useState, useRef, useCallback } from 'react';
import type { Message } from '../types/chat';
import { SYSTEM_PROMPT } from '../data/context';

// Groq — free tier, OpenAI-compatible, reliable model availability.
// See https://console.groq.com/docs/models for the current model list.
const MODEL = 'llama-3.1-8b-instant';

// In dev, route through the Vite proxy (/api/groq → api.groq.com) to avoid CORS.
// In production a backend proxy or serverless function is needed for the same reason.
const API_URL = import.meta.env.DEV
  ? '/api/groq/openai/v1/chat/completions'
  : 'https://api.groq.com/openai/v1/chat/completions';

const STREAM_TIMEOUT_MS = 45_000;
const MAX_INPUT_LENGTH = 8_000;

type Status = 'idle' | 'awaiting' | 'streaming' | 'error';

export interface StreamingChatError {
  kind: 'validation' | 'timeout' | 'api';
  message: string;
}

interface UseStreamingChatProps {
  messages: Message[];
  addMessage: (msg: Message) => void;
  updateById: (id: string, updater: (m: Message) => Partial<Message>) => void;
}

const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function useStreamingChat({ messages, addMessage, updateById }: UseStreamingChatProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<StreamingChatError | null>(null);
  const [currentStreamedMessage, setCurrentStreamedMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const lastUserRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();

    if (!text) {
      setError({ kind: 'validation', message: 'Write something first.' });
      setStatus('error');
      return;
    }
    if (text.length > MAX_INPUT_LENGTH) {
      setError({
        kind: 'validation',
        message: `Message is too long (${text.length} / ${MAX_INPUT_LENGTH}).`,
      });
      setStatus('error');
      return;
    }

    abortRef.current?.abort();

    const userMsg: Message = {
      id: makeId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const assistantId = makeId();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };

    lastUserRef.current = text;
    setError(null);
    setStatus('awaiting');
    setCurrentStreamedMessage('');

    addMessage(userMsg);
    addMessage(assistantMsg);

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => {
      controller.abort(new DOMException('Timeout', 'TimeoutError'));
    }, STREAM_TIMEOUT_MS);

    let receivedAny = false;
    let accumulatedContent = '';

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;

      if (!apiKey) {
        throw new Error('VITE_GROQ_API_KEY is not set. Copy .env.example to .env and add your key.');
      }

      // Build message history — system prompt first, then conversation history,
      // excluding the empty assistant placeholder we just appended.
      const apiMessages = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        ...[...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: apiMessages,
          max_tokens: 4096,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
          `API error ${response.status}`
        );
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // SSE reader loop: HF uses the OpenAI SSE format —
      //   data: {"choices":[{"delta":{"content":"token"}}]}
      // Functional setState in updateById prevents dropped tokens when React
      // batches multiple deltas in the same frame.
      try {
        while (true) {
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;

            try {
              const evt = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const token = evt.choices?.[0]?.delta?.content;
              if (token) {
                if (!receivedAny) {
                  receivedAny = true;
                  setStatus('streaming');
                }
                accumulatedContent += token;
                setCurrentStreamedMessage((prev) => prev + token);
                updateById(assistantId, (m) => ({ content: m.content + token }));
              }
            } catch {
              // Malformed SSE line — skip.
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      updateById(assistantId, () => ({ streaming: false, content: accumulatedContent }));
      setCurrentStreamedMessage('');
      setStatus('idle');
    } catch (err) {
      const isAbort = (err as Error)?.name === 'AbortError';
      const isTimeout =
        (err as Error)?.name === 'TimeoutError' ||
        (isAbort && (controller.signal.reason as Error)?.name === 'TimeoutError');

      updateById(assistantId, (m) => ({ streaming: false, content: m.content || accumulatedContent }));
      setCurrentStreamedMessage('');

      if (isTimeout) {
        setError({ kind: 'timeout', message: `No response within ${STREAM_TIMEOUT_MS / 1000}s. Try again?` });
        setStatus('error');
      } else if (isAbort) {
        setStatus('idle');
      } else {
        setError({
          kind: 'api',
          message: (err as Error)?.message || 'The request failed. Check your connection and retry.',
        });
        setStatus('error');
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, [messages, addMessage, updateById]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (lastUserRef.current) sendMessage(lastUserRef.current);
  }, [sendMessage]);

  const dismissError = useCallback(() => {
    setError(null);
    if (status === 'error') setStatus('idle');
  }, [status]);

  const isLoading = status === 'awaiting' || status === 'streaming';

  return { sendMessage, isLoading, status, error, currentStreamedMessage, cancel, retry, dismissError };
}
