import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button, Typography, Paper, Alert } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  level?: 'app' | 'section' | 'component';
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);

    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Log error to backend
    this.logError(error, errorInfo);

    // Send to error tracking service in production
    if (process.env.NODE_ENV === 'production') {
      this.trackError(error, errorInfo);
    }
  }

  logError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          level: this.props.level || 'app',
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        })
      });
    } catch (err) {
      console.error('Failed to log error:', err);
    }
  };

  trackError = (error: Error, errorInfo: ErrorInfo) => {
    // Integration point for Sentry or similar service
    // if (window.Sentry) {
    //   window.Sentry.captureException(error, {
    //     contexts: {
    //       react: {
    //         componentStack: errorInfo.componentStack
    //       }
    //     }
    //   });
    // }

    console.log('Error tracked:', {
      error: error.message,
      component: errorInfo.componentStack
    });
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    this.props.onReset?.();
  };

  renderFallback() {
    const { fallback, level = 'app' } = this.props;
    const { error, errorInfo, errorCount } = this.state;

    // Use custom fallback if provided
    if (fallback) {
      return fallback;
    }

    // Component-level error (minimal UI)
    if (level === 'component') {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={this.handleReset}>
              Retry
            </Button>
          }
        >
          Component failed to load
        </Alert>
      );
    }

    // Section-level error (contained UI)
    if (level === 'section') {
      return (
        <Paper elevation={2} sx={{ p: 3, m: 2 }}>
          <Box display="flex" alignItems="center" mb={2}>
            <ErrorOutlineIcon color="error" sx={{ mr: 1 }} />
            <Typography variant="h6">Section Error</Typography>
          </Box>
          <Typography variant="body2" mb={2}>
            This section encountered an error and couldn't be displayed.
          </Typography>
          <Button variant="contained" size="small" onClick={this.handleReset}>
            Reload Section
          </Button>
        </Paper>
      );
    }

    // App-level error (full page)
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        p={3}
        sx={{ backgroundColor: '#f5f5f5' }}
      >
        <Paper elevation={3} sx={{ p: 4, maxWidth: 600 }}>
          <Box display="flex" alignItems="center" mb={2}>
            <ErrorOutlineIcon color="error" sx={{ fontSize: 48, mr: 2 }} />
            <Typography variant="h4">Something went wrong</Typography>
          </Box>

          <Typography variant="body1" mb={2}>
            We're sorry, but something unexpected happened. Please try
            reloading the page.
          </Typography>

          {errorCount > 2 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Multiple errors detected. Consider refreshing the entire page.
            </Alert>
          )}

          {process.env.NODE_ENV === 'development' && error && (
            <Box
              sx={{
                backgroundColor: '#ffebee',
                p: 2,
                borderRadius: 1,
                mb: 2,
                overflow: 'auto',
                maxHeight: 300,
                border: '1px solid #ef5350'
              }}
            >
              <Typography variant="subtitle2" color="error" gutterBottom>
                Error Details (Development Only):
              </Typography>
              <Typography variant="caption" component="pre" sx={{ fontSize: '0.75rem' }}>
                {error.toString()}
                {'\n\n'}
                {errorInfo?.componentStack}
              </Typography>
            </Box>
          )}

          <Box display="flex" gap={2}>
            <Button
              variant="contained"
              color="primary"
              onClick={this.handleReset}
            >
              Try Again
            </Button>
            <Button
              variant="outlined"
              onClick={() => window.location.href = '/'}
            >
              Go Home
            </Button>
            <Button
              variant="outlined"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  render() {
    if (this.state.hasError) {
      return this.renderFallback();
    }

    return this.props.children;
  }
}

// Convenience wrapper for section-level boundaries
export const SectionErrorBoundary: React.FC<{
  children: ReactNode;
  sectionName?: string;
}> = ({ children, sectionName }) => (
  <ErrorBoundary
    level="section"
    fallback={
      <Alert severity="error">
        {sectionName ? `Failed to load ${sectionName}` : 'Section failed to load'}
      </Alert>
    }
  >
    {children}
  </ErrorBoundary>
);

// Convenience wrapper for component-level boundaries
export const ComponentErrorBoundary: React.FC<{
  children: ReactNode;
  componentName?: string;
}> = ({ children, componentName }) => (
  <ErrorBoundary
    level="component"
    fallback={
      <Alert severity="warning" sx={{ my: 1 }}>
        {componentName || 'Component'} unavailable
      </Alert>
    }
  >
    {children}
  </ErrorBoundary>
);
