// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { initSync } from "./lib/trie.js";
import { WasmContext } from "./lib.exports.ts";

const file = await Deno.open("./lib/trie_bg.wasm", { read: true });
// const file = await Deno.open("./lib/rs_lib.wasm", { read: true });
const stat = await file.stat();

const output = new Uint8Array(stat.size);
const bytes = await file.read(output);
const wasmModule = await WebAssembly.compile(output.subarray(0, bytes!));
const wasm = initSync({ module: wasmModule });

const ctx = new WasmContext(wasm);
console.log("ROOT:", ctx.root());
const values = {
  "aabbccddeeaabbccddee": 1,
  "aaaaaaaaaaaaaaaa": 2,
  "aaaaaabbaaaaaabb": 3,
  "aaaaaaccaaaaaacc": 4,
  "aaaaaaddeeaaaaaaddee": 5,
};

const encoder = new TextEncoder();
for (const [key, value] of Object.entries(values)) {
  ctx.insert(
    encoder.encode(key),
    new Uint8Array([value]),
  );
  console.log("------------------------------------");
}
console.log("size: ", ctx.storage.size);
const root = ctx.values();
console.log(root.toJSON());
const nibbles = root.nibbles;
console.log("nibbles", nibbles);
