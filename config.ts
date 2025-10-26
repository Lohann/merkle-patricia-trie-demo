import { load } from "@std/dotenv";
import { join } from "@std/path";

const WORKSPACE_DIR: string = import.meta.dirname!;

export enum ReactPlugin {
  FastSWC = "@vitejs/plugin-react-swc",
  SlowJS = "@vitejs/plugin-react",
}
export enum EnvMode {
  Development = "development",
  Production = "production",
}
export interface ViteOptions {
  reactPlugin: ReactPlugin;
  mode: EnvMode;
  baseURL: string;
}

export const config: ViteOptions = {
  reactPlugin: ReactPlugin.FastSWC,
  mode: EnvMode.Development,
  baseURL: "/",
};

interface EnvOptions {
  MPTD_VITE_PLUGIN_REACT?: string;
  MPTD_USE_MODE?: string;
  MPTD_VITE_BASE?: string;
}
const options: EnvOptions = await load({
  envPath: join(WORKSPACE_DIR, ".env").toString()!,
  export: true,
});

switch (options.MPTD_VITE_PLUGIN_REACT) {
  case ReactPlugin.FastSWC:
  case ReactPlugin.SlowJS:
    config.reactPlugin = options.MPTD_VITE_PLUGIN_REACT;
    break;
  case undefined:
    break;
  default:
    throw new Error(`unknown plugin react: ${options.MPTD_VITE_PLUGIN_REACT}`);
}

switch (options.MPTD_USE_MODE) {
  case EnvMode.Development:
  case EnvMode.Production:
    config.mode = options.MPTD_USE_MODE;
    break;
  case undefined:
    break;
  default:
    throw new Error(`unknown mode: ${options.MPTD_USE_MODE}`);
}

if (options.MPTD_VITE_BASE) {
  config.baseURL = options.MPTD_VITE_BASE;
}

if (config.mode === EnvMode.Development) {
  Deno.env.set("DEV", "true");
  Deno.env.set("PROD", "false");
} else if (config.mode === EnvMode.Production) {
  Deno.env.set("DEV", "false");
  Deno.env.set("PROD", "true");
}
