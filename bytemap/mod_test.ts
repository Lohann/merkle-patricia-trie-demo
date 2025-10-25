// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { assertEquals } from "@std/assert";
import { ByteMap } from "./mod.ts";

Deno.test(function mapTest() {
  const map: ByteMap<Uint8Array, number> = new ByteMap();
  const keys: Uint8Array[] = [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([2, 3, 4]),
    new Uint8Array([3, 4, 5]),
    new Uint8Array([4, 5, 6, 7, 8, 9]),
    new Uint8Array([2, 3, 4]),
  ];

  for (let i = 0; i < keys.length; i++) {
    map.set(keys[i], i + 1);
  }
  assertEquals(map.get(keys[0]), 1);
  assertEquals(map.get(keys[1]), 5);
  assertEquals(map.get(keys[2]), 3);
  assertEquals(map.get(keys[3]), 4);
  assertEquals(map.get(keys[4]), 5);
});

Deno.test(function keyEncoder() {
  const map: ByteMap<Uint8Array | string, number> = new ByteMap();
  const keys = new Uint8Array([
    1,
    2,
    3,
    2,
    3,
    4,
    3,
    4,
    5,
    4,
    5,
    6,
    7,
    8,
    9,
    2,
    3,
    4,
  ]);

  map.set(keys.subarray(0, 3), 1);
  map.set(keys.subarray(3, 6), 2);
  map.set(keys.subarray(6, 9), 3);
  map.set(keys.subarray(9, 15), 4);
  map.set(keys.subarray(15, 18), 5);
  map.set("ola mundo!", 6);
  assertEquals(map.get(new Uint8Array([1, 2, 3])), 1);
  assertEquals(map.get(new Uint8Array([2, 3, 4])), 5);
  assertEquals(map.get(new Uint8Array([3, 4, 5])), 3);
  assertEquals(map.get(new Uint8Array([4, 5, 6, 7, 8, 9])), 4);
  assertEquals(map.get(new Uint8Array([2, 3, 4])), 5);
  assertEquals(map.get("ola mundo!"), 6);

  assertEquals(map.rawKey(keys.subarray(0, 3)), "010203");
  assertEquals(map.rawKey(keys.subarray(3, 6)), "020304");
  assertEquals(map.rawKey(keys.subarray(6, 9)), "030405");
  assertEquals(map.rawKey(keys.subarray(9, 15)), "040506070809");
  assertEquals(map.rawKey(keys.subarray(15, 18)), "020304");
  assertEquals(map.rawKey("ola mundo!"), "6f6c61206d756e646f21");
});
