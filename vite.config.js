import { defineConfig } from "vite";
import { resolve } from "node:path";

// Tauri expects a fixed port and serves the `src/` folder as the web root.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  root: "src",
  publicDir: resolve(process.cwd(), "assets"),
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // Don't watch the Rust backend
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Tauri uses Chromium on Windows (WebView2 / Edge) — target evergreen
    target: "es2021",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: {
        dock: resolve(process.cwd(), "src/index.html"),
        settings: resolve(process.cwd(), "src/settings.html"),
      },
    },
  },
});
