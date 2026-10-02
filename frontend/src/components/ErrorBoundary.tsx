import { Component, type ReactNode } from "react";

/** Last line of defence: a crash shows a way out instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("UI error", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold">This screen failed to load</h1>
          <p className="mt-2 text-muted">Reload to try again. If you need to report an emergency, tell your supervisor directly.</p>
          <button className="mt-6 h-11 rounded-md bg-signal px-5 font-semibold text-signal-ink" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
