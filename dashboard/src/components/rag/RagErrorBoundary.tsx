import React from 'react';

/** In short: if anything inside the chat view throws while rendering, show one plain sentence
 * and a reload button instead of the blank page React leaves behind. The error itself is kept
 * out of the page (it can hold a stack trace); the browser console still gets it. */
interface State {
  failed: boolean;
}

export class RagErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  // Declared here because this project has no @types/react, so the base class's own field
  // types are not known to the compiler.
  declare props: { children: React.ReactNode };
  state: State = { failed: false };

  // React calls this when a child throws during rendering; the next render shows the fallback.
  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('The chat view failed to render:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center font-sans text-sm text-neutral-300 bg-[#06070a]">
        <p>The live chat view hit an unexpected error. Reloading the page usually fixes it.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold"
        >
          Reload
        </button>
      </div>
    );
  }
}
