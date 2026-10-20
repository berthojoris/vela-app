import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { tauriIpc } from './lib/tauriIpc';

/**
 * Renders the workspace immediately and reveals the window once React mounts.
 * The native window is created hidden so WebView2 cannot flash a white frame.
 */
const Root: React.FC = () => {
  useEffect(() => {
    void tauriIpc.showWindow();
  }, []);

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
