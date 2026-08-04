import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for offline PWA installation
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New kfit content available, refresh to update.');
  },
  onOfflineReady() {
    console.log('kfit is ready to work 100% offline.');
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
