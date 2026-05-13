import { useState, useCallback, useMemo } from 'react';
import { useChatHistory } from './hooks/useChatHistory';
import { useStreamingChat } from './hooks/useStreamingChat';
import { ChatHistory } from './components/ChatHistory';
import { ChatInput } from './components/ChatInput';
import { ErrorBoundary } from './components/ErrorBoundary';

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

// Two-step armed confirmation for destructive actions.
function useArmedAction(onConfirm: () => void, armedMs = 2400) {
  const [armed, setArmed] = useState(false);

  const trigger = useCallback(() => {
    if (armed) {
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    setTimeout(() => setArmed(false), armedMs);
  }, [armed, armedMs, onConfirm]);

  const cancel = useCallback(() => setArmed(false), []);

  return { armed, trigger, cancel };
}

interface MastheadProps {
  onClear: () => void;
  canClear: boolean;
}

function Masthead({ onClear, canClear }: MastheadProps) {
  const armedClear = useArmedAction(onClear);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  return (
    <header className="masthead">
      <div className="masthead__rule" />
      <div className="masthead__inner">
        <div className="masthead__meta">
          <div>{today}</div>
          <div>llama-3.1-8b-instant · streaming</div>
        </div>
        <div>
          <h1 className="masthead__title">
            Ask <span className="amp">Adam</span>
          </h1>
          <div className="masthead__sub">AI-powered candidate brief</div>
        </div>
        <div className="masthead__meta masthead__meta--right">
          <button
            type="button"
            className="clear-btn"
            onClick={armedClear.trigger}
            disabled={!canClear}
            data-armed={armedClear.armed ? 'true' : 'false'}
            aria-label={armedClear.armed ? 'Press again to confirm clear' : 'Clear chat'}
          >
            {armedClear.armed ? 'Press again' : 'Clear chat'}
            <span className="kbd">{MOD_LABEL}K</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const { messages, addMessage, updateById, clearHistory } = useChatHistory();
  const {
    sendMessage,
    isLoading,
    status,
    error,
    currentStreamedMessage,
    cancel,
    retry,
    dismissError,
  } = useStreamingChat({ messages, addMessage, updateById });

  const [draftSeed, setDraftSeed] = useState<{ value: string; n: number } | null>(null);

  const handleClear = useCallback(() => {
    cancel();
    clearHistory();
    dismissError();
  }, [cancel, clearHistory, dismissError]);

  const canClear = messages.length > 0 || status !== 'idle';

  return (
    <ErrorBoundary>
      <div className="app">
        <Masthead onClear={handleClear} canClear={canClear} />
        <ChatHistory
          messages={messages}
          isLoading={isLoading}
          currentStreamedMessage={currentStreamedMessage}
          error={error}
          onRetry={retry}
          onDismissError={dismissError}
          onPickPrompt={(p) => setDraftSeed({ value: p, n: Date.now() })}
        />
        <ChatInput
          status={status}
          onSend={sendMessage}
          onCancel={cancel}
          onClear={handleClear}
          draftSeed={draftSeed?.value}
        />
      </div>
    </ErrorBoundary>
  );
}
