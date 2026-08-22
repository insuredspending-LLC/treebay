import React from "react";
import { reportClientError } from "@/lib/errorReporting";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, reporting: false, reported: false, reportError: "" };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Tree Marketplace app crash", error, info);
    this.setState({ info }, () => {
      this.submitReport("automatic");
    });
  }

  submitReport = async (source = "manual") => {
    const { error, info, reporting, reported } = this.state;
    if (!error || reporting || reported) return;
    this.setState({ reporting: true, reportError: "" });
    try {
      await reportClientError({
        error,
        componentStack: info?.componentStack || "",
        details: source === "automatic"
          ? "Automatically submitted from the in-app crash recovery screen."
          : "Resubmitted by the user from the in-app crash recovery screen.",
        impact: "blocked",
      });
      this.setState({ reported: true });
    } catch (e) {
      this.setState({ reportError: e?.message || "Could not submit the report automatically." });
    } finally {
      this.setState({ reporting: false });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Tree Marketplace recovered from a page crash</p>
            <h1 className="text-xl font-bold mt-1">This page could not open.</h1>
            <p className="text-sm text-muted-foreground mt-2">You do not need to close the app. Tree Marketplace is sending a private error report automatically so this can be reviewed.</p>
          </div>

          <div className="rounded-xl bg-muted p-3 text-xs break-words">
            <span className="font-semibold">Page:</span> {window.location.pathname}
            <br />
            <span className="font-semibold">Error:</span> {this.state.error?.message || "Unknown page error"}
          </div>

          {this.state.reported ? (
            <div className="rounded-xl bg-emerald-50 text-emerald-800 p-3 text-sm">Crash report submitted.</div>
          ) : (
            <button
              type="button"
              onClick={this.submitReport}
              disabled={this.state.reporting}
              className="w-full min-h-11 rounded-lg border border-input px-4 text-sm font-medium disabled:opacity-60"
            >
              {this.state.reporting ? "Sending report…" : "Retry error report"}
            </button>
          )}
          {this.state.reportError && <p className="text-xs text-destructive">{this.state.reportError}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { window.location.href = "/"; }} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Return Home</button>
            <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border border-input px-4 text-sm font-medium">Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
