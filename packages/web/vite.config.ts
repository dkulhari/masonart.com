import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 3001,
    host: true, // Listen on all network interfaces
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      srcDirectory: 'app',
    }),
    // React's vite plugin must come after TanStack Start's vite plugin
    viteReact(),
  ],
})
