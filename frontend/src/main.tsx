// import { StrictMode } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
// import wasmURL from "../../lib/trie_bg.wasm?url";
import { initialize, type WasmContext } from "@scoped/trie-wasm-bindings";
import { TransientStorage } from "./reducers/transientStorage.ts";
import "./useWorker.ts";

const storage = new TransientStorage();
// const responsePromise = fetch(wasmURL as unknown as string);
// const wasmModule = await WebAssembly.compileStreaming(responsePromise);
const context: WasmContext = await initialize();
context.storage = storage;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App context={context} />
  </StrictMode>,
);

// createRoot(document.getElementById("root")!).render(<App context={context} />);
