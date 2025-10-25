export { WasmContext } from "./src/lib.exports.ts";
export { ChildrenIterator, type Nib, TrieChildren } from "./src/nibbles.ts";
export {
  JSMerklePatriciaTrie,
  JSTrieBuilder,
  type MerklePatriciaTrieNode,
} from "./src/trie.ts";
export { type SyncInitInput } from "./lib/trie.js";

import { atobRaw } from "@scoped/collections/decoder";
import { encodeHex } from "@scoped/collections/encoder";
import { data as wasmBase64, sizeIn, sizeOut } from "./lib/trie_base64.ts";
import { type TrieWasmModule, WasmContext } from "./src/lib.exports.ts";
import { unzlibSync } from "./src/fflate.ts";
import { initSync as wasmInitSync, type SyncInitInput } from "./lib/trie.js";

const EMPTY_ROOT =
  "03170a2e7597b7b7e3d84c05391d139a62b157e78786d8c082f29dcf4c111314";
let CONTEXT: WasmContext | null = null;
export const initialize = async (): Promise<WasmContext> => {
  if (CONTEXT !== null) {
    return CONTEXT;
  }

  // Decompress the wasm binary
  const u8 = new Uint8Array(sizeIn + sizeOut);
  const compressed = atobRaw(
    wasmBase64,
    u8.subarray(sizeOut, sizeOut + sizeIn),
  );
  if (compressed.length !== sizeIn) {
    throw new Error("unexpected compressed wasm size");
  }
  const decompressed = unzlibSync(compressed, u8.subarray(0, sizeOut));
  if (decompressed.length !== sizeOut) {
    throw new Error("unexpected decompressed wasm size");
  }
  const wasmCode = ArrayBuffer.prototype.transferToFixedLength.call(
    u8.buffer,
    sizeOut,
  );

  // Compile and Instantiate
  const compiled = await WebAssembly.compile(wasmCode);
  const instance: TrieWasmModule = wasmInitSync({
    module: compiled as SyncInitInput,
  });
  const context = new WasmContext(instance);
  const root = encodeHex(context.root());

  if (root !== EMPTY_ROOT) {
    throw new Error(`invalid empty root, expected ${EMPTY_ROOT}, got ${root}.`);
  }

  CONTEXT = context;
  return context;
};
