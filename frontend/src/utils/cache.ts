import { encodeHex, value2bytes } from "./encoder.ts";
import { isPrimitive } from "../utils/typeCheck.ts";
import { baseGetTag, TAG } from "../utils/typeCheck.ts";

export type Entry = readonly [string, Uint8Array];

/**
 * Converts a any primitive type to a tuple that
 * contains a hexadecimal string and Uint8Array.
 * @param val
 * @returns
 */
const val2entry = (val: unknown): Entry => {
  let bytes: Uint8Array;
  let hex: string;
  if (ArrayBuffer.isView(val)) {
    val = new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
  }

  if (val instanceof Uint8Array) {
    hex = encodeHex(val);
    bytes = val.slice();
  } else {
    bytes = value2bytes(val);
    hex = encodeHex(bytes);
  }
  return Object.freeze([hex, bytes]);
};

const SMALL_NUMBER: string[] = ((): string[] => {
  const bytes = new Uint8Array(4);
  bytes[0] = "0".charCodeAt(0);
  bytes[1] = "x".charCodeAt(0);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const array = new Array(256);

  const table = "0123456789ABCDEF";
  for (let i = 0; i < array.length; i = i + 1 | 0) {
    const n = i & 0xff | 0;
    bytes[3] = table.charCodeAt(n & 0x0f);
    bytes[2] = table.charCodeAt(n >> 4);
    array[i] = decoder.decode(bytes);
  }
  return array;
})();

/**
 * Caches values converted to Uint8Array and hexadecimal string.
 * Objects are stored in the WeakMap, to avoid memory leaks.
 *
 * Motivation:
 * Each time the javascript runtime needs to interact with the wasm binary,
 * the javascript object must be converted to Uint8Array, but for display
 * the value in the console or DOM we must convert it to hexadecimal string,
 * this class caches those values, avoiding constant conversion.
 */
export class EntryCache {
  /**
   * Entry value for `null` and `undefined`
   */
  static readonly EMPTY: Entry = Object.freeze(["0x", new Uint8Array(0)]);

  /**
   * Cache that only store primitive values, because
   * the WeakMap only stores objects and symbols.
   */
  #primitives: Map<unknown, Entry>;

  /**
   * Cache that only objects, using WeakMap
   * avoid memory leaks.
   */
  #objects: WeakMap<object, Entry>;

  constructor() {
    this.#primitives = new Map();
    this.#objects = new WeakMap();
  }

  #cachedSymbol(sym: symbol): never {
    const tag = baseGetTag(sym);
    throw new Error(`is not possible to store symbols: ${tag}`);
  }

  #cachedNumber(num: number | bigint): Entry {
    // BigInt and Numbers are both encoded in little-endian format, for
    // consistently use the same key for BigInt(0) and 0, numbers.
    // are first normalized as follow:
    // - BigInt less than 32bit are converted to native number.
    // - native numbers greater than 32-bit are converted to BigInt.
    // - float values raw bytes are casted to 64bit BigInt.

    // zero and one are static.
    const i32: number = Number(num) | 0;
    if ((i32 & 0xff) == num) {
      return [SMALL_NUMBER[i32 & 0xff], new Uint8Array([i32])];
    }

    if (typeof num === "number") {
      if (Number.isInteger(num)) {
        num = BigInt(num);
      } else {
        // NaN, infinite, and float values are converted to raw bytes.
        const float64array = new Float64Array(1);
        float64array[0] = num;
        const u64array = new BigInt64Array(float64array.buffer, 0, 1);
        num = u64array[0];
      }
    } else {
      // if the bigint fits in 32bit, convert it to Number.
      num = BigInt(i32 | 0) === num ? i32 : num;
    }

    // Check if the number is cached
    let entry: Entry | undefined = this.#primitives.get(num);
    if (entry) return entry;

    // Cache the number
    const bytes: Uint8Array = value2bytes(num);
    entry = Object.freeze([encodeHex(bytes), bytes]);
    this.#primitives.set(num, entry);
    return entry;
  }

  #cachedString(str: string): Entry {
    if (str.length === 0) return EntryCache.EMPTY;
    let entry: Entry | undefined = this.#primitives.get(str);
    if (entry !== undefined) return entry;
    entry = val2entry(str);
    if (entry[0] === str) {
      this.#objects.set(entry[1], entry);
    } else {
      this.#primitives.set(entry[0], entry);
      this.#objects.set(entry[1], entry);
    }
    this.#primitives.set(str, entry);

    return entry;
  }

  #cachedObject(obj: object): Entry {
    // if null or undefined, return EMPTY bytes.
    if (obj == null) return EntryCache.EMPTY;

    if (obj instanceof WeakRef) {
      const val = obj.deref();
      if (isPrimitive(val)) {
        return this.getOrCache(val);
      }
      obj = val;
    }

    const entry: Entry | undefined = this.#objects.get(obj);
    if (entry) return entry;

    const tag = baseGetTag(obj);
    switch (tag) {
      case TAG.null:
        return EntryCache.EMPTY;
      case TAG.boolean:
        return this.#cachedNumber(obj.valueOf() ? 1 : 0);
      case TAG.number:
        return this.#cachedNumber(obj.valueOf() as number);
      case TAG.string:
        return this.#cachedString(obj.valueOf() as string);
      default:
        throw new Error(`unsupported type: ${tag}`);
    }
  }

  public getOrCache(val: unknown): Entry {
    // if null or undefined, return EMPTY bytes.
    if (val == null) return EntryCache.EMPTY;

    let entry: Entry | undefined;
    if (ArrayBuffer.isView(val)) {
      if (val.byteLength === 0) return EntryCache.EMPTY;
      entry = val2entry(val);
      this.#primitives.set(entry[0], entry);
      this.#objects.set(entry[1], entry);
      return entry;
    }

    switch (typeof val) {
      case "boolean":
        entry = this.#cachedNumber(val ? 0 : 1);
        break;
      case "bigint":
      case "number":
        entry = this.#cachedNumber(val);
        break;
      case "symbol":
        entry = this.#cachedSymbol(val);
        break;
      case "string":
        entry = this.#cachedString(val);
        break;
      case "object": {
        if (val instanceof Number) {
          entry = this.#cachedNumber(Number(val));
        } else if (val instanceof String) {
          entry = this.#cachedString(String(val));
        }
        entry = this.#cachedObject(val);
        break;
      }
    }
    if (entry === undefined) {
      throw new Error(`unsuported type: ${baseGetTag(val)}`);
    }
    return entry;
  }

  public clear(): void {
    this.#primitives.clear();
  }
}
