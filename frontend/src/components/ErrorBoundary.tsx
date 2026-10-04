import { Component, type ReactNode } from "react";
import { initialLanguage, translate } from "@/i18n";

/** Last line of defence: a crash shows a way out instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("UI error", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    // Sits outside the providers (it must survive their crashes), so it reads the saved language directly.
    const lang = initialLanguage();
    return (
      <div role="alert" className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold">{translate(lang, "error.title")}</h1>
          <p className="mt-2 text-muted">{translate(lang, "error.body")}</p>
          <button className="mt-6 h-11 rounded-md bg-signal px-5 font-semibold text-signal-ink" onClick={() => location.reload()}>{translate(lang, "error.reload")}</button>
        </div>
      </div>
    );
  }
}
