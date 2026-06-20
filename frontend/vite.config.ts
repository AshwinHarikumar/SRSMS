import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — almost never changes
          'vendor-react': ['react', 'react-dom'],
          // Map libraries — large, infrequently updated
          'vendor-maps': ['leaflet', 'react-leaflet'],
          // Charts library
          'vendor-charts': ['recharts'],
          // Animation library
          'vendor-motion': ['framer-motion'],
          // Deck.gl (optional, only used in DeckGLMap)
          'vendor-deckgl': ['deck.gl', '@deck.gl/react', '@deck.gl/layers', '@deck.gl/geo-layers'],
          // Icons
          'vendor-icons': ['lucide-react'],
        }
      }
    }
  }
})
