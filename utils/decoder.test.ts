// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { assertEquals } from "@std/assert";
import { atobRaw } from "./decoder.ts";

const TESTS = [
  // hello world Приветствую ми 你好
  "aGVsbG8gd29ybGQg0J/RgNC40LLQtdGC0YHRgtCy0YPRjiDQvNC4IOS9oOWlvQ==",
  // ✓ à la mode
  "4pyTIMOgIGxhIG1vZGU=",
  // Hello World!
  "SGVsbG8gV29ybGQh",
  // hex: 0x00
  "AA==",
  // hex: 0x0000
  "AAA=",
  // hex: 0x000000
  "AAAA",
];

Deno.test(function base64Decode() {
  for (const base64 of TESTS) {
    assertEquals(atobRaw(base64), Uint8Array.fromBase64(base64));
  }
});
