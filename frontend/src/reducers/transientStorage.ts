// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { type TrieStorage } from "../../../lib.exports.ts";
import { bytes2str, decodeHex, encodeHex } from "../utils/encoder.ts";

function _encodeRefCounter(val: number): Uint8Array {
  if (!Number.isInteger(val)) {
    throw new Error("invalid ref counter");
  }
  return new Uint8Array([
    (val >> 0) & 0xff,
    (val >> 8) & 0xff,
    (val >> 16) & 0xff,
    (val >> 24) & 0xff,
  ]);
}

function _decodeRefCounter(bytes: Uint8Array): number {
  if (bytes.length !== 4) {
    throw new Error("invalid ref counter");
  }
  return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
}

enum StorageFlags {
  LOADED = 1,
  UPDATED = 2,
  DELETED = 4,
  MISSING = 8,
  CREATED = 16,
}

export type StorageValue = [ref: number, bytes: string];
export type StorageChanges = { [key: string]: StorageValue | null };
export type TransientStorageHandler = (key: string) => StorageValue | undefined;

function key2id(key: Uint8Array): string {
  if (key.length === 0) {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  if (key.length === 33) {
    if (key[32] !== 0xff) {
      throw new Error(`invalid storage counter prefix: ${encodeHex(key)}`);
    }
    return encodeHex(key.subarray(0, 32));
  }
  if (key.length === 32) {
    return encodeHex(key);
  }
  throw new Error(`invalid storage key: ${encodeHex(key)}`);
}

function updateBytes(
  oldValue?: Uint8Array,
  newValue?: Uint8Array,
): Uint8Array | undefined {
  if (newValue === undefined) return undefined;
  if (oldValue === undefined) return newValue.slice();

  if (oldValue.length < newValue.length) {
    return newValue.slice();
  }

  if (oldValue.byteOffset) {
    const len = oldValue.length;
    const b = new Uint8Array(oldValue.buffer);
    b.set(oldValue);
    oldValue = b.subarray(0, len);
  }

  oldValue.set(newValue, 0);
  if (oldValue.length === newValue.length) {
    return oldValue;
  }
  return new Uint8Array(
    ArrayBuffer.prototype.transfer.call(oldValue.buffer, newValue.length),
  );
}

function areEqual(a?: Uint8Array, b?: Uint8Array): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

const ROOT_STORAGE_ID = key2id(new Uint8Array(0));
const REF_COUNT_ZERO = _encodeRefCounter(0);

interface StoredValue {
  originalValue: Uint8Array | undefined;
  key: Uint8Array;
  val: Uint8Array | undefined;
  ref: Uint8Array;
  flags: number;
}

export class TransientStorage implements TrieStorage {
  private storage: Map<string, StoredValue>;
  private handler?: TransientStorageHandler;

  constructor(root?: string, handler?: TransientStorageHandler) {
    this.storage = new Map();
    if (root || handler) {
      this.setHandler(root!, handler!);
    }
  }

  _loadKey(storageID: string, key: Uint8Array): StoredValue {
    const stored: StoredValue | undefined = this.storage.get(storageID);
    if (stored) {
      return stored;
    }

    if (key.length === 0 && this.handler !== undefined) {
      throw new Error("ROOT NOT FOUND, call setHandlers first !!");
    }

    // Cannot load root.
    if (this.handler === undefined || key.length === 0) {
      if (key.length > 0) {
        throw new Error(
          "Attempt to load store, but no root found and no handler set",
        );
      }
      const value: StoredValue = {
        originalValue: undefined,
        key: new Uint8Array(0),
        val: undefined,
        ref: _encodeRefCounter(0),
        flags: StorageFlags.MISSING,
      };
      this.storage.set(storageID, value);
      return value;
    }
    if (key.length < 32) throw new Error("INVALID KEY");
    const keyBytes = key.length === 32
      ? key.slice()
      : key.subarray(0, 32).slice();

    const loadedValue = this.handler(storageID);
    if (loadedValue !== undefined) {
      const originalValue = loadedValue ? decodeHex(loadedValue[1]) : undefined;
      const value: StoredValue = {
        originalValue: originalValue,
        key: keyBytes,
        val: originalValue,
        ref: _encodeRefCounter(loadedValue ? loadedValue[0] : 0),
        flags: StorageFlags.LOADED,
      };
      this.storage.set(storageID, value);
      return value;
    }

    // Key doesn't exists
    const value: StoredValue = {
      originalValue: undefined,
      key: keyBytes,
      val: undefined,
      ref: _encodeRefCounter(loadedValue ? loadedValue[0] : 0),
      flags: StorageFlags.MISSING,
    };
    this.storage.set(storageID, value);
    return value;
  }

  _updateValue(
    storageID: string,
    key: Uint8Array,
    newVal?: Uint8Array,
  ): StoredValue {
    const stored = this._loadKey(storageID, key);
    const keyLength = key.length;

    // Update Merkle Root
    if (keyLength === 0) {
      if (areEqual(stored.val, newVal)) {
        return stored;
      }
      if (newVal === undefined) {
        stored.val = undefined;
        stored.ref = _encodeRefCounter(0);
        return stored;
      }
      if (newVal.length !== 32) {
        throw new Error("invalid merkle root size");
      }
      stored.val = updateBytes(stored.val, newVal)!;
      stored.ref = _encodeRefCounter(1);
      stored.flags = StorageFlags.UPDATED;
      return stored;
    }

    // Update Ref Count
    if (keyLength === 33) {
      if (newVal !== undefined) {
        stored.ref = newVal.slice();
      } else {
        stored.ref = updateBytes(stored.ref, REF_COUNT_ZERO)!;
      }
      return stored;
    }
    if (keyLength !== 32) throw new Error("[bug] key.length != 32");

    // Update value
    stored.val = updateBytes(stored.val, newVal);
    return stored;
  }

  merkleRoot(): string {
    const entry = this.storage.get(ROOT_STORAGE_ID);
    if (
      entry === undefined || entry.val === undefined || entry.val.length != 32
    ) {
      throw new Error("[bug] invalid root");
    }
    return encodeHex(entry.val);
  }

  setHandler(root: string, handler: TransientStorageHandler): void {
    const newRoot = decodeHex(root);
    if (newRoot.length !== 32) {
      throw new Error("invalid root");
    }
    this.handler = handler;
    this.storage.clear();
    const stored: StoredValue = {
      originalValue: newRoot,
      key: new Uint8Array(0),
      val: newRoot,
      ref: _encodeRefCounter(1),
      flags: StorageFlags.LOADED,
    };
    this.storage.set(ROOT_STORAGE_ID, stored);
  }

  getStorage(key: Uint8Array): Uint8Array | undefined {
    if (key.length === 0) {
      const root = this.storage.get(ROOT_STORAGE_ID);
      return root ? root.val : undefined;
    }
    const storageID = key2id(key);
    const stored = this._loadKey(storageID, key);
    if (key.length === 33) {
      return areEqual(stored.ref, REF_COUNT_ZERO) ? undefined : stored.ref;
    }
    return stored.val;
  }

  hasStorage(key: Uint8Array): boolean {
    const storageID = key2id(key);
    if (key.length === 0) {
      const root = this.storage.get(ROOT_STORAGE_ID);
      if (root) return root.val !== undefined;
      return false;
    }
    const stored = this._loadKey(storageID, key);
    if (key.length === 33) {
      return !areEqual(stored.val, REF_COUNT_ZERO);
    }
    return stored.val !== undefined;
  }

  setStorage(key: Uint8Array, value: Uint8Array): void {
    const storageID = key2id(key);
    this._updateValue(storageID, key, value);
  }

  deleteStorage(key: Uint8Array): Uint8Array | undefined {
    const storageID = key2id(key);
    const oldValue = this._loadKey(storageID, key).val;
    this._updateValue(storageID, key, undefined);
    return oldValue;
  }

  getChanges(): StorageChanges {
    const changes: StorageChanges = {};
    this.storage.entries().forEach(([storageID, stored]) => {
      if (storageID === ROOT_STORAGE_ID) return;
      if (stored.key.length !== 32) {
        throw new Error("[bug] stored.key.length !== 32");
      }
      const { key, val, ref, originalValue } = stored;
      if (areEqual(originalValue, val)) return;

      const keyStr: string = bytes2str(key);
      if (val !== undefined) {
        let refCount = _decodeRefCounter(ref);
        if (refCount <= 0) {
          console.error(`[bug] refcount < 0 for ${storageID}`);
          refCount = 1;
        }
        changes[keyStr] = [refCount, bytes2str(val)];
      } else {
        changes[keyStr] = null;
      }
    });
    return changes;
  }

  clear(): void {
    this.storage.clear();
  }
}
