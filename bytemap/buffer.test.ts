// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { assertEquals } from "@std/assert";
import { decodeHex, encodeHex } from "jsr:@std/encoding/hex";
import { type BufferOptions, ByteBuffer } from "./buffer.ts";

Deno.test(function writeBytes() {
  const buffer = new ByteBuffer();
  assertEquals(buffer.length, 0);

  buffer.writeU8List([1, 2, 3, 4]);
  assertEquals(buffer.length, 4);
  assertEquals(Array.from(buffer.slice()), [1, 2, 3, 4]);
  buffer.writeU8List([1, 3, 3, 7]);
  assertEquals(buffer.length, 8);
  assertEquals(Array.from(buffer.slice()), [1, 2, 3, 4, 1, 3, 3, 7]);
});

Deno.test(function writeInt() {
  const buffer = new ByteBuffer();
  assertEquals(buffer.length, 0);

  const input = [1, 2, 3, 4, 0x01, 0x02, 0x03, 0x04, 0xed, 0xcc];
  buffer.writeU8List(input.slice(0, 4));
  assertEquals(Array.from(buffer.slice()), input.slice(0, 4));

  buffer.writeU32(0x01020304);
  assertEquals(buffer.length, 8);
  assertEquals(Array.from(buffer.slice()), input.slice(0, 8));

  buffer.writeI16(-0x01234);
  assertEquals(Array.from(buffer.slice()), input.slice(0, 10));
});

Deno.test(function dynamicWorks() {
  const buffer = new ByteBuffer({ capacity: 2 });
  assertEquals(buffer.length, 0);
  assertEquals(buffer.capacity, 2);

  buffer.writeU8List([1, 2]);
  assertEquals(buffer.length, 2);
  assertEquals(buffer.capacity, 2);

  buffer.writeU8List([3]);
  assertEquals(buffer.length, 3);
  assertEquals(buffer.capacity, 4);

  buffer.writeU8List([4, 5]);
  assertEquals(buffer.length, 5);
  assertEquals(buffer.capacity, 8);
  assertEquals(Array.from(buffer.slice()), [1, 2, 3, 4, 5]);
});

Deno.test(function dynamicWorks() {
  const buffer = new ByteBuffer({ capacity: 2 });
  assertEquals(buffer.length, 0);
  assertEquals(buffer.capacity, 2);

  buffer.writeU8List([1, 2]);
  assertEquals(buffer.length, 2);
  assertEquals(buffer.capacity, 2);

  buffer.writeU8List([3]);
  assertEquals(buffer.length, 3);
  assertEquals(buffer.capacity, 4);

  buffer.writeU8List([4, 5]);
  assertEquals(buffer.length, 5);
  assertEquals(buffer.capacity, 8);
  assertEquals(Array.from(buffer.slice()), [1, 2, 3, 4, 5]);
});

Deno.test(function writeU32List() {
  const buffer = new ByteBuffer({ capacity: 32 });
  assertEquals(buffer.length, 0);
  assertEquals(buffer.capacity, 32);

  buffer.writeU32List([0x01020304, 0x05060708, 0x090a0b0c, 0x0d0e0f10]);
  assertEquals(buffer.length, 16);
  assertEquals(buffer.capacity, 32);
  assertEquals(buffer.slice(), decodeHex("04030201080706050c0b0a09100f0e0d"));
});

Deno.test(function writeU32Endianess() {
  const buffer = new ByteBuffer({ capacity: 16 });
  assertEquals(buffer.length, 0);
  assertEquals(buffer.capacity, 16);

  buffer.writeU32List([0x01020304, 0x05060708, 0x090a0b0c, 0x0d0e0f10], false);
  assertEquals(buffer.length, 16);
  assertEquals(buffer.capacity, 16);
  assertEquals(buffer.slice(), decodeHex("0102030405060708090a0b0c0d0e0f10"));
});
