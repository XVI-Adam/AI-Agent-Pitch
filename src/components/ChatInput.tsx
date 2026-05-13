import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

interface ChatInputProps {
  status: 'idle' | 'awaiting' | 'streaming' | 'error';
  onSend: (text: string) => void;
  onCancel: () => void;
  onClear: () => void;
  draftSeed?: string;
}

export function ChatInput({ status, onSend, onCancel, onClear, draftSeed }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const streaming = status === 'awaiting' || status === 'streaming';

  // Seed the textarea when an empty-state prompt pill is clicked.
  useEffect(() => {
    if (draftSeed) {
      setValue(draftSeed);
      taRef.current?.focus();
    }
  }, [draftSeed]);

  // Auto-size the textarea to its content, capped by CSS max-height.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [value]);

  const submit = useCallback(() => {
    if (streaming) {
      onCancel();
      return;
    }
    if (!value.trim()) {
      setValidationError(true);
      setTimeout(() => setValidationError(false), 600);
      onSend('');
      return;
    }
    onSend(value);
    setValue('');
  }, [streaming, value, onSend, onCancel]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  // Cmd+K: clear chat shortcut handled here in addition to Masthead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClear]);

  return (
    <div className="dock">
      <div className="dock__inner">
        <div
          className="composer"
          data-focused={focused ? 'true' : 'false'}
          data-error={validationError ? 'true' : 'false'}
        >
          <textarea
            ref={taRef}
            className="composer__field"
            placeholder="Type a message…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={1}
            spellCheck
            aria-label="Message to Dispatch"
            disabled={status === 'awaiting'}
          />
          <div className="composer__bar">
            <div className="composer__hint" data-streaming={streaming ? 'true' : 'false'}>
              {streaming ? (
                <>
                  <span className="dot" />
                  <span>
                    {status === 'awaiting' ? 'Reaching the model…' : 'Streaming response'}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <span className="kbd">{MOD_LABEL}</span>
                    <span className="kbd">↵</span>
                    to send
                  </span>
                  <span>
                    <span className="kbd">{MOD_LABEL}</span>
                    <span className="kbd">K</span>
                    to clear
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              className="submit"
              onClick={submit}
              disabled={!streaming && !value.trim()}
              data-streaming={streaming ? 'true' : 'false'}
              aria-label={streaming ? 'Stop streaming' : 'Send message'}
            >
              {streaming ? 'Stop' : 'Send'}
              <span className="submit__arrow" aria-hidden="true">
                {streaming ? '■' : '→'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
