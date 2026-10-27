import { Component, ErrorInfo, ReactNode } from 'react';

interface ViewErrorBoundaryProps {
  /** Shown in the message so the reader knows which view failed. */
  viewName: string;
  children: ReactNode;
}

interface ViewErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one broken view from blanking the whole console.
 *
 * React unmounts the entire tree when a component throws while rendering and nothing catches it,
 * which turns a bug in one view (for example the Experiments view reading a field a result file
 * does not have) into an empty page. This boundary catches the throw, shows the error message,
 * and lets the reader pick another tab: App.tsx gives it `key={tab}`, so switching tab resets it.
 * It reports the failure instead of hiding it: the message is on screen and in the console.
 */
export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  // Declared because this project has no @types/react, so the base class's props and setState are
  // not known to the compiler.
  declare props: ViewErrorBoundaryProps;
  declare setState: (state: ViewErrorBoundaryState) => void;
  state: ViewErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`The ${this.props.viewName} view crashed:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ios-liquid-card rounded-2xl p-10 text-center font-mono text-xs space-y-2" role="alert">
        <p className="text-rose-300">The {this.props.viewName} view hit an error and could not be shown.</p>
        <p className="text-neutral-400 break-words">{this.state.error.message}</p>
        <p className="text-neutral-500">The rest of the console still works; pick another tab, or try again.</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-3 px-4 py-2 rounded-xl bg-white/10 text-neutral-100 hover:bg-white/20"
        >
          Try again
        </button>
      </div>
    );
  }
}
