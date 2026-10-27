import React from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";

/**
 * Last line of defence: a render error in one page must never leave the user
 * staring at a blank screen with their session apparently lost.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[StudyFlow] render error", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-boundary">
        <div className="card">
          <div className="card-header">
            <div className="card-heading">
              <span className="card-icon">
                <AlertOctagon size={16} />
              </span>
              <div>
                <h3>Something broke in the interface</h3>
                <p>Your data is safe — this was a display error, not a save failure.</p>
              </div>
            </div>
          </div>
          <p className="muted small mono">{String(error?.message || error)}</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => window.location.assign("/app")}>
              <RotateCcw size={16} />
              <span>Reload the app</span>
            </button>
            <button className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
              <span>Dismiss</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
