import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // ws:true is required or the /v1/ws upgrade request is proxied as plain
      // HTTP and the dashboard falls back to polling ("STREAM DOWN").
      '/v1': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
