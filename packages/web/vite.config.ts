import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  server: {
    port: 3001,
    host: true, // Listen on all network interfaces
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      srcDirectory: "app",
    }),
    // React's vite plugin must come after TanStack Start's vite plugin
    viteReact(),
    // Bundle analysis — generates stats.html after build
    // Run: ANALYZE=true bun run build
    ...(process.env.ANALYZE
      ? [
          visualizer({
            open: true,
            filename: "bundle-stats.html",
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
        manualChunks: {
          // Vendor chunks for better caching
          "vendor-react": ["react", "react-dom"],
          "vendor-router": ["@tanstack/react-router", "@tanstack/react-start"],
        },
      },
    },
  },
});
