import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { SplashScreen } from './components/splash/SplashScreen';
import { tauriIpc } from './lib/tauriIpc';

/**
 * Renders App immediately so profiles/worktrees load while the splash is on
 * screen, and overlays the splash on top of it until it completes.
 */
const Root: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashComplete = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    // Reveal window once React is mounted and splash screen is ready in DOM
    void tauriIpc.showWindow();
  }, []);

  return (
    <ErrorBoundary>
      <App />
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    </ErrorBoundary>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
