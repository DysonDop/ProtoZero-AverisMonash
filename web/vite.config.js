import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // mocks/ is the static root, not public/, because the fixtures are the app's
  // data source until the API exists and they have to ship with the build.
  // Set VITE_API_BASE=/api for the single-container production build.
  // Everything in here is copied to the site root, so it holds favicon.svg too
  // and must not hold anything we would not serve publicly. The fixtures README
  // lives at web/README.md for exactly that reason.
  publicDir: 'mocks',
  server: { port: 5175, proxy: { '/api': 'http://127.0.0.1:8000' } },
})
