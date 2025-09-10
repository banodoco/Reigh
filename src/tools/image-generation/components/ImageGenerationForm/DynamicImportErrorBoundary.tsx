import React from "react";

// Error boundary for dynamic import failures
export class DynamicImportErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: () => React.ReactNode },
  { hasError: boolean; retryCount: number }
> {
  constructor(props: { children: React.ReactNode; fallback: () => React.ReactNode }) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Check if it's a dynamic import error
    if (error.message.includes('Failed to fetch dynamically imported module') || 
        error.message.includes('Loading chunk')) {
      console.warn('Dynamic import failed, this is often due to deployment/cache issues:', error);
    }
  }

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      retryCount: this.state.retryCount + 1 
    });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback();
    }

    return this.props.children;
  }
}
