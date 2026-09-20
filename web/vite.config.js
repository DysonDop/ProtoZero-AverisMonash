import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // mocks/ is the static root, not public/, because the fixtures are the app's
  // data source until the API exists and they have to ship with the build.
  // Set VITE_API_BASE=/api to read from Gene's API instead.
  publicDir: 'mocks',
  server: { port: 5175 },
})
