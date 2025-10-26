// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { xxh32raw } from "./xxhash32.ts";

function key2string(key: Uint8Array): number {
  const dataView = new DataView(key.buffer, key.byteOffset, key.byteLength);
  return xxh32raw(dataView);
}

export class ByteMap<V> {
  protected map: Map<number, readonly [Uint8Array, V]>;

  public constructor(entries?: readonly (readonly [Uint8Array, V])[] | null) {
    const map = new Map();
    if (entries) {
      for (const entry of entries) {
        const rawKey = key2string(entry[0]);
        map.set(rawKey, entry);
      }
    }
    this.map = map;
  }

  /**
   * Returns a specified element from the Map object. If the value that is associated to the provided key is an object, then you will get a reference to that object and any change made to that object will effectively modify it inside the Map.
   * @returns Returns the element associated with the specified key. If no element is associated with the specified key, undefined is returned.
   */
  public rawKey(key: Uint8Array): number {
    return key2string(key);
  }

  /**
   * Returns a specified element from the Map object. If the value that is associated to the provided key is an object, then you will get a reference to that object and any change made to that object will effectively modify it inside the Map.
   * @returns Returns the element associated with the specified key. If no element is associated with the specified key, undefined is returned.
   */
  public get(key: Uint8Array): V | undefined {
    const entry = this.map.get(key2string(key));
    if (entry) {
      return entry[1];
    }
    return entry;
  }

  /**
   * @returns boolean indicating whether an element with the specified key exists or not.
   */
  public has(key: Uint8Array): boolean {
    return this.map.has(key2string(key));
  }

  /**
   * Adds a new element with a specified key and value to the Map. If an element with the same key already exists, the element will be updated.
   */
  public set(key: Uint8Array, value: V): this {
    this.map.set(key2string(key), [key, value]);
    return this;
  }

  /**
   * @returns true if an element in the Map existed and has been removed, or false if the element does not exist.
   */
  public delete(key: Uint8Array): boolean {
    return this.map.delete(key2string(key));
  }

  /**
   * @returns the number of elements in the Map.
   */
  public get size() {
    return this.map.size;
  }

  /**
   * Executes a provided function once per each key/value pair in the Map, in insertion order.
   */
  public forEach(
    callbackfn: (value: V, key: Uint8Array, map: ByteMap<V>) => void,
    thisArg?: unknown,
  ): void {
    if (thisArg !== undefined) {
      callbackfn = callbackfn.bind(thisArg);
    }
    for (const [key, value] of this.map.values()) {
      callbackfn(value, key, this);
    }
  }
}
