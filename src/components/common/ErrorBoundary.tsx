import React from 'react';
import { errorMessage } from '../../lib/errors';
import { tauriIpc } from '../../lib/tauriIpc';

export class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    onClose?: () => void;
  },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error: errorMessage(error) };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Vela interface error', error, info.componentStack);
    void tauriIpc
      .reportError(`Interface error: ${error.message}\n${info.componentStack ?? ''}`)
      .catch((error) => console.error('Unable to write diagnostic log', error));
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section
        role="alert"
        className="h-full flex flex-col justify-center items-start gap-4 p-6 bg-orca-darkest text-orca-text"
      >
        <h2 className="text-lg font-semibold">This view could not be displayed</h2>
        <p className="text-sm text-orca-muted max-w-lg break-words select-text">{this.state.error}</p>
        <p className="text-sm text-orca-muted">
          {this.props.onClose
            ? 'Other terminals are still available. Close this tab and open a new terminal.'
            : 'Restart Vela to recover. Running terminal processes may be stopped.'}
        </p>
        {this.props.onClose && (
          <button
            type="button"
            onClick={this.props.onClose}
            className="px-3 py-2 rounded-md border border-orca-border hover:bg-orca-hover text-sm"
          >
            Close this tab
          </button>
        )}
      </section>
    );
  }
}
