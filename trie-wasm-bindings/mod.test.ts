import { assertEquals } from "@std/assert";
import { initialize, type WasmContext } from "./mod.ts";
import { encodeHex } from "@scoped/utils";

Deno.test(async function emptyRootMatches() {
  const ctx: WasmContext = await initialize();
  assertEquals(
    encodeHex(ctx.root()),
    "03170a2e7597b7b7e3d84c05391d139a62b157e78786d8c082f29dcf4c111314",
  );
});

Deno.test(async function trieInsert() {
  const ctx: WasmContext = await initialize();
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
  }
  assertEquals(
    encodeHex(ctx.root()),
    "fe75886a1b89a68c781aab2b52a599c9729db9734ab7170882f0728c3744df80",
  );
});
