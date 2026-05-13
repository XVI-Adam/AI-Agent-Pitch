import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production this would ship to Sentry / Datadog.
    console.error('Dispatch render crash:', error, info);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (this.state.error) {
      return (
        <div className="crash" role="alert">
          <div className="crash__kicker">Stop the presses</div>
          <h2 className="crash__head">Something went sideways while rendering.</h2>
          <p className="crash__body">
            The chat hit an unexpected error. Your conversation is still saved.
          </p>
          <pre>{String(this.state.error?.stack || this.state.error)}</pre>
          <button className="clear-btn" onClick={this.reset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
