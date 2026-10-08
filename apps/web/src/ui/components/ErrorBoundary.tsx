import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GameButton } from './GameButton';

interface ErrorBoundaryState {
  failed: boolean;
}

/** Last line of defence: a render error shows a recovery screen, never a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unexpected UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen" role="alert">
        <p>Something went wrong. Your recorded battles are safe.</p>
        <GameButton
          onClick={() => {
            window.location.hash = '#/';
            window.location.reload();
          }}
        >
          Back to the menu
        </GameButton>
      </main>
    );
  }
}
