import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="m-3 rounded-panel border border-ember/30 bg-ember-soft p-4 text-center text-ink">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-ember/15 text-ember">
            <AlertCircle className="h-5 w-5" />
          </div>
          <p className="mt-2 text-[13px] font-medium text-pine">PulseBot encountered a display issue</p>
          <p className="mt-1 text-[11.5px] text-ink-muted">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="btn btn-secondary btn-sm mt-3 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset PulseBot
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
