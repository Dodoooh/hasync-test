import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary level="app">
      <AppThemeProvider>
        <App />
      </AppThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
