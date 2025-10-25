// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { assertEquals } from "@std/assert";
import { ByteMap } from "./mod.ts";

const encoder = new TextEncoder();
const utf8 = (str: string): Uint8Array => encoder.encode(str);

Deno.test(function mapTest() {
  const map: ByteMap<number> = new ByteMap();
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
  const map: ByteMap<number> = new ByteMap();
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
  map.set(utf8("ola mundo!"), 6);
  assertEquals(map.get(new Uint8Array([1, 2, 3])), 1);
  assertEquals(map.get(new Uint8Array([2, 3, 4])), 5);
  assertEquals(map.get(new Uint8Array([3, 4, 5])), 3);
  assertEquals(map.get(new Uint8Array([4, 5, 6, 7, 8, 9])), 4);
  assertEquals(map.get(new Uint8Array([2, 3, 4])), 5);
  assertEquals(map.get(utf8("ola mundo!")), 6);

  assertEquals(map.rawKey(keys.subarray(0, 3)), 0xf59c78c4);
  assertEquals(map.rawKey(keys.subarray(3, 6)), 0x3f0ed2d4);
  assertEquals(map.rawKey(keys.subarray(6, 9)), 0x833c14fa);
  assertEquals(map.rawKey(keys.subarray(9, 15)), 0x373bf689);
  assertEquals(map.rawKey(keys.subarray(15, 18)), 0x3f0ed2d4);
  assertEquals(map.rawKey(utf8("ola mundo!")), 0x9dc4d337);
});
