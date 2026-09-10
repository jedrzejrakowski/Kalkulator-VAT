import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Kopia lokalna aplikacji, żeby otwierała się przy zerwanym łączu.
// Tylko w wersji produkcyjnej — w trakcie pracy nad kodem tylko by przeszkadzała.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Brak obsługi albo zakaz w przeglądarce nie może przerwać działania kalkulatora.
    });
  });
}
