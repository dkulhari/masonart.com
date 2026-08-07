import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  server: {
    port: 3001,
    host: true, // Listen on all network interfaces
    /**
     * Hostnames the dev server will answer to.
     *
     * `host: true` binds every interface, but Vite still checks the Host
     * HEADER and rejects anything unlisted — a DNS-rebinding defence, not a
     * binding one. So reaching the dev server from another machine on the LAN
     * ("macmini:3001") fails with "Blocked request. This host is not allowed"
     * even though the port is plainly open.
     *
     * Listed explicitly rather than set to `true`. `allowedHosts: true`
     * disables the check outright, which is the thing the check exists to
     * prevent: a page on any origin can then resolve a name it controls to
     * this machine and read whatever the dev server serves.
     *
     * Add machine names here as they come up; localhost and IP literals are
     * always permitted and need no entry.
     */
    allowedHosts: ['macmini', 'macmini.local'],
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      srcDirectory: 'app',
    }),
    // React's vite plugin must come after TanStack Start's vite plugin
    viteReact(),
    // Bundle analysis — generates stats.html after build
    // Run: ANALYZE=true bun run build
    ...(process.env.ANALYZE
      ? [
          visualizer({
            open: true,
            filename: 'bundle-stats.html',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  build: {
    // Warn when chunks exceed 250KB
    chunkSizeWarningLimit: 250,
    rollupOptions: {
      output: {
        // Function form, not object form: the SSR pass externalizes react,
        // and rollup rejects object-form manualChunks that name an external
        // module. Externals are never passed to the function, so this
        // applies vendor chunking to the client build only.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom)[\\/]/.test(id)) {
            return 'vendor-react'
          }
          if (/[\\/]node_modules[\\/]@tanstack[\\/]react-(router|start)/.test(id)) {
            return 'vendor-router'
          }
        },
      },
    },
  },
})
