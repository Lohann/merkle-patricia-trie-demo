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
const rAlphabet = new Uint8Array(128).fill(16); // alphabet.length
alphabet.forEach((byte, i) => rAlphabet[byte] = i);
new TextEncoder()
  .encode("ABCDEF")
  .forEach((byte, i) => rAlphabet[byte] = i + 10);
const getRawTag = Object.prototype.toString;

function getByte(char: number): number {
  const byte = rAlphabet[char] ?? 16;
  if (byte === 16) { // alphabet.Hex.length
    throw new TypeError(
      `Cannot decode input as hex: Invalid character (${
        String.fromCharCode(char)
      })`,
    );
  }
  return byte;
}

export function decodeHex(src: string): Uint8Array {
  if (src.startsWith("0x")) src = src.substring(2);
  const buffer = new TextEncoder().encode(src) as Uint8Array;
  if ((buffer.length) % 2 === 1) {
    throw new RangeError(
      `Cannot decode input as hex: Length (${buffer.length}) must be divisible by 2`,
    );
  }
  let o = 0;
  let i = 1;
  for (; i < buffer.length; i += 2) {
    buffer[o++] = (getByte(buffer[i - 1]!) << 4) |
      getByte(buffer[i]!);
  }
  return new Uint8Array(ArrayBuffer.prototype.transfer.call(buffer.buffer, o));
}

const alphabetUpperCase = new TextEncoder().encode("0123456789ABCDEF");
/**
 * @param src
 * @returns
 */
export function encodeHex(src: Uint8Array, prefix: boolean = true): string {
  src = src.slice();
  let i = src.length;
  let output = src as Uint8Array;
  if (output.byteOffset) {
    const b = new Uint8Array(output.buffer);
    b.set(output);
    output = b.subarray(0, i);
  }
  let o = prefix ? 2 : 0;
  output = new Uint8Array(
    ArrayBuffer.prototype.transfer.call(output.buffer, (i * 2) + o),
  );
  output.set(output.subarray(0, i), i + o);
  i += o;
  for (; i < output.length; ++i) {
    const x = output[i];
    output[o++] = alphabetUpperCase[x >> 4];
    output[o++] = alphabetUpperCase[x & 15];
  }
  if (prefix) {
    output[0] = "0".charCodeAt(0);
    output[1] = "x".charCodeAt(0);
  }
  return new TextDecoder().decode(output);
}

let cachedTextDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
});

cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded: number = 0;
function decodeUTF8(bytes: Uint8Array): string {
  numBytesDecoded += bytes.length;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", {
      ignoreBOM: true,
      fatal: true,
    });
    cachedTextDecoder.decode();
    numBytesDecoded = bytes.length;
  }
  return cachedTextDecoder.decode(bytes);
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
  if ((value | 0) === value) {
    // The number is 32-bit signed integer, encode it
    // using the minimal number of bytes possible.
    value |= 0;
    if (value === 0) return new Uint8Array(1);

    // store the absolute value, otherwise any negative
    // values will be encoded using 32-bit.
    let abs = Math.abs(value) | 0;

    // cast 32-bit signed to unsigned integer.
    value >>>= 0;

    // write bytes in little-endian.
    const bytes = [];
    while (abs > 0) {
      bytes.unshift(value & 0xff);
      value >>>= 8;
      abs >>>= 8;
    }
    return new Uint8Array(bytes);
  }

  // If the value is integer, encode it as bigint.
  if (Number.isInteger(value)) {
    return bigint2bytes(BigInt(value));
  }

  // Otherwise encode as float64.
  float64array[0] = value;
  return new Uint8Array(float64array.buffer.slice(), 0, 8);
}

function primitive2bytes(value: Key): Uint8Array {
  const tag = getRawTag.call(value);
  switch (tag) {
    case "[object String]":
      if (typeof value !== "string") throw new Error();
      if (value.startsWith("0x")) {
        try {
          return decodeHex(value);
        } catch (_error) {}
      }
      return new TextEncoder().encode(value as string);
    case "[object Uint8Array]":
      return Uint8Array.prototype.slice.call(value);
    case "[object ArrayBuffer]":
      return new Uint8Array(value as ArrayBuffer);
    case "[object Number]":
      return number2bytes(value as number);
    case "[object BigInt]":
      return bigint2bytes(value as bigint);
    default:
      throw new Error(`cannot convert to bytes: ${tag}`);
  }
}

const EMPTY_BUFFER = new ArrayBuffer(0);
const EMPTY_UINT8 = new Uint8Array(EMPTY_BUFFER);
/**
 * Converts `message` to an Uint8Array.
 *
 * @param message input to convert.
 * @returns
 */
export function value2bytes(value: unknown): Uint8Array {
  if (value == null) {
    return EMPTY_UINT8;
  }

  if (value instanceof Uint8Array) {
    return value.slice();
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY_UINT8;
    if (value.length === 1) return primitive2bytes(value[0]);
    const r = value.map((val) => primitive2bytes(val));
    const len = r.reduce((c, arr) => (c + arr.length), 0);
    const buffer = new Uint8Array(len);
    let i = 0;
    for (const arr of r) {
      buffer.set(arr, i);
      i += arr.length;
    }
    return buffer;
  }
  return primitive2bytes(value as Key);
}

/**
 * If the provided bytes represents a valid UTF8 string,
 * decode it as an string, otherwise decode as hexdecimal string.
 *
 * @param bytes input to convert.
 * @returns UTF8 string or hexdecimal bytes
 */
export function bytes2str(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const isUTF8 = bytes.every((byte) => (byte >= 32 && byte < 127));
  if (isUTF8) {
    const str = decodeUTF8(bytes);
    return str;
  }
  return encodeHex(bytes);
}
