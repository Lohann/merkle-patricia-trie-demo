// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { assertEquals } from "@std/assert";
import { atobRaw } from "./decoder.ts";

const TESTS = [
  {
    // hello world Приветствую ми 你好
    base64: "aGVsbG8gd29ybGQg0J/RgNC40LLQtdGC0YHRgtCy0YPRjiDQvNC4IOS9oOWlvQ==",
    output: new Uint8Array([
      104,
      101,
      108,
      108,
      111,
      32,
      119,
      111,
      114,
      108,
      100,
      32,
      208,
      159,
      209,
      128,
      208,
      184,
      208,
      178,
      208,
      181,
      209,
      130,
      209,
      129,
      209,
      130,
      208,
      178,
      209,
      131,
      209,
      142,
      32,
      208,
      188,
      208,
      184,
      32,
      228,
      189,
      160,
      229,
      165,
      189,
    ]),
  },
  {
    // ✓ à la mode
    base64: "4pyTIMOgIGxhIG1vZGU=",
    output: new Uint8Array([
      226,
      156,
      147,
      32,
      195,
      160,
      32,
      108,
      97,
      32,
      109,
      111,
      100,
      101,
    ]),
  },
  {
    // Hello World!
    base64: "SGVsbG8gV29ybGQh",
    output: new Uint8Array([
      72,
      101,
      108,
      108,
      111,
      32,
      87,
      111,
      114,
      108,
      100,
      33,
    ]),
  },
  {
    base64: "AA==",
    output: new Uint8Array([0]),
  },
  {
    base64: "AAA=",
    output: new Uint8Array([0, 0]),
  },
  {
    base64: "AAAA",
    output: new Uint8Array([0, 0, 0]),
  },
];

Deno.test(function base64Decode() {
  for (const { base64, output } of TESTS) {
    assertEquals(atobRaw(base64), output);
  }
});
