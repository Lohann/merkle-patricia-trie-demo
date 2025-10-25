// import { StrictMode } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import wasmURL from "../../lib/trie_bg.wasm?url";
import { initSync } from "../../lib/trie.js";
import { WasmContext } from "../../lib.exports.ts";
import { TransientStorage } from "./reducers/transientStorage.ts";
import "./useWorker.ts";

const storage = new TransientStorage();
const responsePromise = fetch(wasmURL as unknown as string);
const wasmModule = await WebAssembly.compileStreaming(responsePromise);
const wasm = initSync({ module: wasmModule });
const context = new WasmContext(wasm, storage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App context={context} />
  </StrictMode>,
);

// createRoot(document.getElementById("root")!).render(<App context={context} />);
