// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type Key =
  | string
  | number
  | bigint
  | Uint8Array
  | ArrayBufferLike;

const alphabet = new TextEncoder().encode("0123456789abcdef");
const getRawTag = Object.prototype.toString;

/**
 * @param src
 * @returns
 */
export function encodeHex(src: string | Uint8Array | Array<number>): string {
  if (typeof src === "string") {
    src = new TextEncoder().encode(src);
  } else if (src instanceof ArrayBuffer) {
    src = new Uint8Array(src).slice();
  } else {
    src = src.slice();
  }
  let i = src.length;
  let output = src as Uint8Array;
  if (output.byteOffset) {
    const b = new Uint8Array(output.buffer);
    b.set(output);
    output = b.subarray(0, i);
  }
  output = new Uint8Array(
    ArrayBuffer.prototype.transfer.call(output.buffer, i * 2),
  );
  output.set(output.subarray(0, i), i);
  for (let o = 0; i < output.length; ++i) {
    const x = output[i];
    output[o++] = alphabet[x >> 4];
    output[o++] = alphabet[x & 15];
  }
  return new TextDecoder().decode(output);
}

/**
 * Converts a BigInt into a Uint8Array, the array length is
 * always multiple of 8.
 * @param value bigint to convert to bytes
 * @returns
 */
export function bigint2bytes(value: bigint): Uint8Array {
  const isNegative = value < 0n;
  const limbs: bigint[] = [];
  do {
    limbs.push(BigInt.asUintN(64, value));
    value >>= 64n;
  } while (value > 0n || value < -1n);
  const isMsbSet = limbs[limbs.length - 1] >= 0x8000000000000000n;
  if (isNegative !== isMsbSet) {
    limbs.push(BigInt.asUintN(64, value));
  }
  const byteLen = limbs.length * 8;
  const buffer = new ArrayBuffer(byteLen);
  const view = new DataView(buffer);
  for (let i = 0; i < byteLen; i += 8) {
    view.setBigUint64(i, limbs.pop()!, false);
  }
  return new Uint8Array(buffer, 0, byteLen);
}

const float64array = new Float64Array(1);
/**
 * @param value bigint to convert to bytes
 * @returns
 */
export function number2bytes(value: number): Uint8Array {
  if (Number.isInteger(value)) return bigint2bytes(BigInt(value));
  float64array[0] = value;
  return new Uint8Array(float64array.buffer.slice(), 0, 8);
}

/**
 * Converts `message` to an Uint8Array.
 *
 * @param message input to convert.
 * @returns
 */
export function key2bytes(value: Key): Uint8Array {
  const tag = getRawTag.call(value);
  switch (tag) {
    case "[object String]":
      return new TextEncoder().encode(value as string);
    case "[object Uint8Array]":
      return Uint8Array.prototype.slice.call(value);
    case "[object ArrayBuffer]":
      return new Uint8Array(value as ArrayBuffer).slice();
    case "[object Number]":
      return number2bytes(value as number);
    case "[object BigInt]":
      return bigint2bytes(value as bigint);
    default:
      throw new Error(`cannot convert to bytes: ${tag}`);
  }
}

export const bigint2limbs = (num: bigint): Uint32Array => {
  const isNegative = num < 0n;
  const limbs: number[] = [];
  do {
    limbs.push(Number(BigInt.asUintN(32, num)) | 0);
    num >>= 32n;
  } while (num > 0n || num < -1n);
  const isMsbSet = limbs[limbs.length - 1] >= 0x80000000;
  if (isNegative !== isMsbSet) {
    limbs.push(Number(BigInt.asUintN(32, num)));
  }
  return new Uint32Array(limbs);
};

const _BUFFER = new ArrayBuffer(1024);
const _BYTEVIEW = new Uint8Array(_BUFFER);
const _ENCODER = new TextEncoder();
export function encodeUTF8(str: string): Uint8Array {
  if ((str.length * 2) >= _BUFFER.byteLength) return _ENCODER.encode(str);
  const { written, read }: TextEncoderEncodeIntoResult = _ENCODER.encodeInto(
    str,
    _BYTEVIEW,
  );
  if (read < str.length) return _ENCODER.encode(str);
  return _BYTEVIEW.subarray(0, written);
}
