import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import "react";
import "react-dom";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  // root: "dist",
  root: "./",
  publicDir: "public",
  base: "https://lohann.dev/",
  cacheDir: ".vite",
  envPrefix: [],
  server: {
    port: 3000,
    fs: {
      // Allow serving files from one level up to the project root
      allow: [".."],
    },
  },
  plugins: [tailwindcss(), react(), deno()],
  optimizeDeps: {
    include: ["react/jsx-runtime"],
  },
  build: {
    outDir: "dist",
    copyPublicDir: true,
    cssMinify: true,
    minify: true,
    reportCompressedSize: true,
  },
  esbuild: { legalComments: "none" },
});
