import { defineConfig, type PluginOption } from "vite";
import "react";
import "react-dom";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { Path } from "@david/path";
import { config, ReactPlugin } from "../config.ts";

console.log("config:", config);
const FRONTEND_ROOT: Path = new Path(import.meta.dirname!);
const WORKSPACE_ROOT: Path = FRONTEND_ROOT.parent()!;
const NODE_MODULES_DIR: Path = WORKSPACE_ROOT.resolve("node_modules")!;

let react: () => PluginOption;
if (config.reactPlugin === ReactPlugin.FastSWC) {
  react = (await import("@vitejs/plugin-react-swc")).default;
} else {
  react = (await import("@vitejs/plugin-react")).default;
}

// https://vite.dev/config/
export default defineConfig({
  // root: "dist",
  root: FRONTEND_ROOT.toString(),
  publicDir: "public",
  base: config.baseURL,
  cacheDir: ".vite",
  envPrefix: [],
  server: {
    port: 3000,
    fs: {
      // Allow serving files from one level up to the project root
      allow: [
        WORKSPACE_ROOT.toString(),
        NODE_MODULES_DIR.toString(),
      ],
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
