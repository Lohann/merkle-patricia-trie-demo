// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const { atob } = globalThis;
/**
 * @description
 * A base64 decoding function (browser-only).
 */
export function atobRaw(src: string, output?: Uint8Array): Uint8Array {
  const byteStr = atob(src);
  let len = byteStr.length;
  let buffer: Uint8Array = output === undefined ? new Uint8Array(len) : output;
  if (buffer.length > len) {
    buffer = buffer.subarray(0, len);
  }
  len = Math.min(buffer.length, byteStr.length);
  for (let i = 0; i < len; i++) {
    const code = byteStr.charCodeAt(i);
    const byte = code & 0xff | 0;
    if (code !== byte) {
      throw new Error("invalid hexadecimal string");
    }
    buffer[i] = byte;
  }
  return buffer;
}
