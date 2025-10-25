import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import "react";
import "react-dom";
import svgr from "vite-plugin-svgr";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
// import wasm from "vite-plugin-wasm";
// import topLevelAwait from "vite-plugin-top-level-await";

// https://vite.dev/config/
export default defineConfig({
  // root: "dist",
  root: "./",
  publicDir: "public",
  // base: "https://lohann.dev/",
  cacheDir: ".vite",
  envPrefix: [],
  server: {
    port: 3000,
    fs: {
      // Allow serving files from one level up to the project root
      allow: [".."],
    },
  },
  plugins: [tailwindcss(), react(), svgr({ include: "**/*.svg" }), deno()],
  optimizeDeps: {
    include: ["react/jsx-runtime"],
  },
  build: {
    cssMinify: true,
  },
  esbuild: { legalComments: "none" },
});
