import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { firestoreFetcher } from './firestoreFetcher'

// Intercept window.fetch if VITE_USE_FIRESTORE environment variable is enabled
if (import.meta.env.VITE_USE_FIRESTORE === 'true') {
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    // Intercept SRSMS API calls and route them directly to Firebase Firestore
    if (url.includes('/api/data')) {
      return firestoreFetcher(url, init);
    }
    return originalFetch(input, init);
  };
  console.log('🛡️ SRSMS Interceptor Active: API calls are routed directly to Firestore.');
}

createRoot(document.getElementById('root')!).render(
  <App />
)
