// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { assertEquals } from "@std/assert";
import { Slab } from "./slab.ts";

Deno.test(function insert() {
  const slab = new Slab();
  const values = [123, 456, 789, 2147483647];
  assertEquals(slab.length, 0);
  for (let i = 0; i < values.length; i++) {
    assertEquals(slab.insert(values[i]), i);
    assertEquals(slab.length, i + 1);
    for (let j = 0; j < (i + 1); j++) {
      assertEquals(slab.get(j), values[j]);
    }
  }
});

Deno.test(function remove() {
  const slab = new Slab();
  assertEquals(slab.insert(0xaa), 0);
  assertEquals(slab.insert(0xbb), 1);
  assertEquals(slab.insert(0xcc), 2);
  assertEquals(slab.insert(0xdd), 3);

  assertEquals(slab.remove(2), 0xcc);
  assertEquals(slab.length, 3);
  assertEquals(slab.remove(1), 0xbb);
  assertEquals(slab.length, 2);
  assertEquals(slab.remove(0), 0xaa);
  assertEquals(slab.length, 1);
  assertEquals(slab.remove(3), 0xdd);
  assertEquals(slab.length, 0);
});

function check(slab: Slab, expected: (number | null)[]): void {
  let len = 0;
  for (let i = 0; i < expected.length; i++) {
    if (typeof expected[i] !== "number") {
      assertEquals(slab.get(i), undefined);
      continue;
    }
    len++;
    assertEquals(slab.get(i), expected[i]);
  }
  assertEquals(slab.length, len);
}

Deno.test(function insertAndRemove() {
  const slab = new Slab();
  assertEquals(slab.insert(0xaa), 0);
  assertEquals(slab.insert(0xbb), 1);
  assertEquals(slab.insert(0xcc), 2);
  assertEquals(slab.insert(0xdd), 3);
  assertEquals(slab.insert(0xee), 4);
  assertEquals(slab.insert(0xff), 5);
  check(slab, [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);

  assertEquals(slab.remove(2), 0xcc);
  check(slab, [0xaa, 0xbb, null, 0xdd, 0xee, 0xff]);

  assertEquals(slab.insert(0x22), 2);
  check(slab, [0xaa, 0xbb, 0x22, 0xdd, 0xee, 0xff]);

  assertEquals(slab.remove(4), 0xee);
  check(slab, [0xaa, 0xbb, 0x22, 0xdd, null, 0xff]);

  assertEquals(slab.remove(0), 0xaa);
  check(slab, [null, 0xbb, 0x22, 0xdd, null, 0xff]);

  assertEquals(slab.remove(2), 0x22);
  check(slab, [null, 0xbb, null, 0xdd, null, 0xff]);

  assertEquals(slab.insert(0x11), 2);
  check(slab, [null, 0xbb, 0x11, 0xdd, null, 0xff]);

  assertEquals(slab.insert(0x22), 0);
  check(slab, [0x22, 0xbb, 0x11, 0xdd, null, 0xff]);

  assertEquals(slab.insert(0x33), 4);
  check(slab, [0x22, 0xbb, 0x11, 0xdd, 0x33, 0xff]);
});
