import { xxh32num, xxh32raw } from "./xxhash32.ts";
import { xxh32stream } from "./xxhash32-stream.ts";
import { bigint2limbs, encodeUTF8 } from "./encoder.ts";

const _VISITED: Map<object, number> = new Map();

type Input = ArrayBufferView | string | number | bigint | symbol;

// Same constants used by Mutable JS
// https://github.com/immutable-js/immutable-js/blob/v5.1.4/src/Hash.ts#L50-L52
const UNDEFINED_CODE: number = 0x42108423;
const NULL_CODE: number = 0x42108422;
const TRUE_CODE: number = 0x42108421;
const FALSE_CODE: number = 0x42108420;
const ARRAY_CODE: number = 0x203ec93f;
const OBJECT_CODE: number = 0x1ff46daf;
const REPEATED_SEED: number = 0x29eeac2b;
const INVALID_CODE: number = Number.NaN;
const _isInvalid = Number.isNaN;

const _SYMBOL_MAP = Object.create(null);
const _symbolToString = Symbol.prototype.toString;

const rotl32 = (x: number, r: number) => (x << r) | (x >>> 32 - r);

function hashSymbol(sym: symbol): number {
  let hash = _SYMBOL_MAP[sym];
  if (hash !== undefined) {
    return hash;
  }
  name = _symbolToString.call(sym);
  hash = _SYMBOL_MAP[name];
  if (hash === undefined) {
    hash = xxh32(name, 0x3a73796d);
  } else {
    hash = xxh32num(hash, 0x3a73796d);
  }
  _SYMBOL_MAP[name] = hash;
  hash = smi(hash);
  _SYMBOL_MAP[sym] = hash;
  return hash;
}

function xxh32primitive(val: Input, seed: number): number {
  if (val == null) {
    return xxh32num(val === null ? NULL_CODE : UNDEFINED_CODE, seed, 4);
  }
  if (ArrayBuffer.isView(val)) {
    return xxh32raw(
      new DataView(val.buffer, val.byteOffset, val.byteLength),
      seed,
    );
  }
  switch (typeof val) {
    case "number":
      return xxh32num(val, seed);
    case "boolean":
      return xxh32num(val | 0, seed, 1);
    case "symbol":
      return xxh32num(hashSymbol(val) | 0, seed, 4);
    case "bigint": {
      return xxh32(bigint2limbs(val), seed);
    }
    case "string":
      return xxh32(encodeUTF8(val), seed);
  }
  return INVALID_CODE;
}

function hashMerge(a: number, b: number): number {
  return Math.imul(
    rotl32((a | 0) + Math.imul(b | 0, 0xC2B2AE3D) | 0, 17),
    0x27D4EB2F,
  );
  // return xxh32num(a, b, 4); // int
}

function hashRepeated(a: number, current: number): number {
  return Math.imul(
    rotl32((a | 0) + Math.imul(current | 0, REPEATED_SEED) | 0, 17),
    0x27D4EB2F,
  );
}

function xxh32obj(
  obj: { readonly [key: string]: Input },
  seed: number,
): number {
  let hash: number | undefined = _VISITED.get(obj);
  if (hash !== undefined) {
    return hashRepeated(hash, seed);
  }
  hash = hashMerge(OBJECT_CODE, seed);
  for (const [key, value] of Object.entries(obj)) {
    _VISITED.set(obj, hash);
    const k = xxh32primitive(encodeUTF8(key), hash);
    let next: number;
    if (_VISITED.has(value as object)) {
      next = hashMerge(k, hashRepeated(_VISITED.get(value as object)!, hash));
    } else if (Array.isArray(value)) {
      next = hashMerge(k, xxh32ordered(value, hash));
    } else {
      next = hashMerge(k, xxh32primitive(value, seed));
    }
    hash = hashMerge(hash, next);
  }
  return hash;
}

function xxh32ordered(
  array: readonly Input[],
  seed: number,
): number {
  const len = array.length | 0;
  let hash: number = xxh32num(ARRAY_CODE, seed, len);
  for (let i = 0; i < len; i = i + 1 | 0) {
    const value = array[i];
    let next: number;
    if (Array.isArray(value)) {
      _VISITED.set(array, hash);
      if (_VISITED.has(value)) {
        next = xxh32num(_VISITED.get(value)!, REPEATED_SEED, len);
      } else {
        next = xxh32ordered(value, hash);
      }
    } else {
      next = xxh32primitive(value, seed);
    }
    hash = hashMerge(hash, next);
  }
  return hash;
}

const xxh32recursive = (
  val: ArrayBufferView | string | number | bigint | symbol,
  seed = 0,
): number => {
  if (val == null) {
    return xxh32num(val === null ? NULL_CODE : UNDEFINED_CODE, seed, 4);
  }
  if (ArrayBuffer.isView(val)) {
    return xxh32raw(
      new DataView(val.buffer, val.byteOffset, val.byteLength),
      seed,
    );
  }
  switch (typeof val) {
    case "undefined":
      return 0;
    case "number":
      return xxh32num(val ? TRUE_CODE : FALSE_CODE, seed);
    case "boolean":
      return xxh32num(val | 0, seed, 1);
    case "symbol":
      return xxh32num(hashSymbol(val) | 0, seed, 4);
    case "bigint":
      return xxh32(bigint2limbs(val), seed);
    case "string": {
      const encoded = (new TextEncoder()).encode(val);
      return xxh32(encoded, seed);
    }
    case "object": {
      if (Array.isArray(val)) {
        return xxh32ordered(val, seed);
      }
    }
  }
  throw new Error("invalid type");
};

export const xxh32 = (
  val: ArrayBufferView | string | number | bigint | symbol,
  seed = 0,
): number => {
  _VISITED.clear();
  return xxh32recursive(val, seed);
};

// v8 has an optimization for storing 31-bit signed numbers.
// Values which have either 00 or 11 as the high order bits qualify.
// This function drops the highest order bit in a signed number, maintaining
// the sign bit.
export function smi(i32: number): number {
  return ((i32 >>> 1) & 0x40000000) | (i32 & 0xbfffffff);
}
