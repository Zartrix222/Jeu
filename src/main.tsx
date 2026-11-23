import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { IS_ARTIFACT, getDownloads } from './lib/host';
import './styles.css';

if (IS_ARTIFACT) {
  document.documentElement.classList.add('in-artifact');
  void getDownloads();
} else {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
