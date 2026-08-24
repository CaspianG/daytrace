import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  resolve: {
    // Transformers.js otherwise bundles a second 23 MB fallback runtime even
    // though Daytrace supplies and pins its own single-threaded WASM runtime.
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    // On Windows a live dev watcher can hold freshly extracted Electron files
    // open long enough to break electron-builder's atomic staging rename.
    watch: {
      ignored: ["**/dist/**", "**/release/**", "**/native/**/bin/**", "**/native/**/obj/**"],
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
