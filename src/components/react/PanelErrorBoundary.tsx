import React, { Component } from 'react';
import type { ReactNode } from 'react';
import { captureException } from '@/utils/posthog';
import { reportClientError } from '@/utils/diagnostics-client';

interface PanelErrorBoundaryProps {
  children: ReactNode;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to PostHog if available
    if (typeof captureException === 'function') {
      captureException(error, {
        extra: {
          errorInfo,
          componentStack: errorInfo.componentStack
        }
      });
    }

    // A panel crash is a real user-visible failure, but it never reached the admin
    // diagnostics list — only PostHog. Report it like route-boundary errors already are.
    reportClientError(error, 'client_js', { panelErrorBoundary: true });

    // Also log to console for debugging
    console.error('PanelErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-6 bg-white rounded-[24px]">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-[var(--color-deep-grey)] mb-2">
              Failed to load panel
            </h2>
            <p className="text-sm text-[var(--color-pebble-grey)] mb-4">
              {this.state.error?.message || 'An error occurred while loading this panel.'}
            </p>
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-[var(--color-bold-blue)] text-white rounded-full hover:opacity-90 transition-opacity font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

