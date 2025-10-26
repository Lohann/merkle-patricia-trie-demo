import { ByteBuffer, ByteMap, type Key, key2bytes } from "@scoped/utils";
import type { JSMerklePatriciaTrie } from "./trie.ts";
import type { InitOutput } from "../lib/trie.d.ts";
export { JSTrieBuilder } from "./trie.ts";
export type TrieWasmModule = InitOutput;

function __ext_log(memory: Uint8Array, ptr: number, len: number) {
  ptr = ptr >>> 0;
  if ((ptr + len) >= memory.length) {
    console.error("ptr out of bounds");
    return;
  }
  const text = decodeText(memory.subarray(ptr / 1, ptr / 1 + len));
  console.log(text);
}

function __ext_input(
  memory: Uint8Array,
  buffer_ptr: number,
  buffer_len_ptr: number,
  input?: Uint8Array,
): number {
  if (buffer_ptr >= memory.length) {
    console.error("__ext_input: buffer_ptr out of bounds");
    return ReturnCode.Trapped;
  }
  if (buffer_len_ptr >= memory.length) {
    console.error("__ext_input: buffer_len_ptr out of bounds");
    return ReturnCode.Trapped;
  }
  buffer_ptr = buffer_ptr >>> 0;
  buffer_len_ptr = buffer_len_ptr >>> 0;
  const dataView = new DataView(memory.buffer);
  const maxlen = dataView.getUint32(buffer_len_ptr, true);
  if (maxlen >= memory.length) {
    console.error(
      `__ext_input: memory out of bounds: ${maxlen} <= ${memory.length}`,
    );
    return ReturnCode.Trapped;
  }
  if (input) {
    const len = Math.min(maxlen, input.length);
    dataView.setUint32(buffer_len_ptr, input.length, true);
    (new Uint8Array(memory.buffer, buffer_ptr, len)).set(input);
  } else {
    dataView.setUint32(buffer_len_ptr, 0, true);
  }
  return ReturnCode.Success;
}

let cachedTextDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
});

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes: Uint8Array) {
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

/// The raw return code returned by the host side.
enum ReturnCode {
  /// Success
  Success = 0,

  /// Can only be returned from `call` and `instantiate`
  Trapped = 1,

  /// An output buffer is returned when one was supplied.
  Reverted = 2,

  /// The provided key does not exist in storage.
  KeyNotFound = 3,
}

export class HostFn {
  private static instance?: WasmContext = undefined;

  public static attach(context: WasmContext): void {
    HostFn.instance = context;
  }

  public static __ext_log(ptr: number, len: number): void {
    const instance = HostFn.instance;
    if (!instance) return;
    const memory = instance.getMemory();
    __ext_log(memory, ptr, len);
  }

  public static __ext_input(buffer_ptr: number, buffer_len_ptr: number): void {
    const instance = HostFn.instance;
    if (!instance) return;
    const memory = instance.getMemory();
    const inputLen = instance.inputLen;
    if (inputLen > 0) {
      const input = WasmContext.SHARED_INPUT_BUFFER.subarray(0, inputLen);
      __ext_input(memory, buffer_ptr, buffer_len_ptr, input);
    } else {
      __ext_input(memory, buffer_ptr, buffer_len_ptr);
    }
  }

  public static __ext_get_storage(
    key_ptr: number,
    key_len: number,
    val_ptr: number,
    val_len_ptr: number,
  ): number {
    const instance = HostFn.instance;
    if (!instance) return ReturnCode.Trapped;
    const memory = instance.getMemory();
    if ((key_ptr + key_len) >= memory.length || val_ptr >= memory.length) {
      return ReturnCode.Reverted;
    }
    const key = memory.subarray(key_ptr / 1, key_ptr / 1 + key_len);
    const value = instance.storage.getStorage(key);
    const result = __ext_input(memory, val_ptr, val_len_ptr, value);
    if (result != ReturnCode.Success) {
      return result;
    }
    return value ? ReturnCode.Success : ReturnCode.KeyNotFound;
  }

  public static __ext_set_storage(
    key_ptr: number,
    key_len: number,
    val_ptr: number,
    val_len: number,
  ): number {
    const instance = HostFn.instance;
    if (!instance) return ReturnCode.Trapped;
    const memory = instance.getMemory();
    if (
      (key_ptr + key_len) >= memory.length ||
      (val_ptr + val_len) >= memory.length
    ) {
      return ReturnCode.Reverted;
    }
    const key = memory.subarray(key_ptr / 1, key_ptr / 1 + key_len);
    const value = memory.subarray(val_ptr / 1, val_ptr / 1 + val_len);
    const k = new Uint8Array(key.length);
    k.set(key);
    const v = new Uint8Array(value.length);
    v.set(value);
    instance.storage.setStorage(k, v);
    return ReturnCode.Success;
  }

  public static __ext_clear_storage(key_ptr: number, key_len: number): number {
    const instance = HostFn.instance;
    if (!instance) return ReturnCode.Trapped;
    const memory = instance.getMemory();
    if ((key_ptr + key_len) >= memory.length) {
      return ReturnCode.Reverted;
    }
    const key = memory.subarray(key_ptr / 1, key_ptr / 1 + key_len);
    instance.storage.deleteStorage(key);
    return ReturnCode.Success;
  }
}

export interface TrieStorage {
  getStorage(key: Uint8Array): Uint8Array | undefined;
  hasStorage(key: Uint8Array): boolean;
  setStorage(key: Uint8Array, value: Uint8Array): void;
  deleteStorage(key: Uint8Array): void;
  clear(): void;
}

export class DefaultTrieStorage extends ByteMap<Uint8Array>
  implements TrieStorage {
  getStorage(key: Uint8Array): Uint8Array | undefined {
    return this.get(key);
  }
  hasStorage(key: Uint8Array): boolean {
    const rawKey = this.rawKey(key);
    return this.map.has(rawKey);
  }
  setStorage(key: Uint8Array, value: Uint8Array): void {
    const rawKey = this.rawKey(key.slice());
    const entry = this.map.get(rawKey);
    if (entry) {
      this.map.set(rawKey, [entry[0], value.slice()]);
    } else {
      this.map.set(rawKey, [key.slice(), value.slice()]);
    }
  }
  deleteStorage(key: Uint8Array): void {
    const rawKey = super.rawKey(key.slice());
    this.map.delete(rawKey);
  }
  clear(): void {
    this.map.clear();
  }
}

export class WasmContext {
  private instance: TrieWasmModule;
  private memory: Uint8Array;
  private merkleRoot: Uint8Array;
  public storage: TrieStorage;
  public initialState: Uint8Array;
  public inputLen: number;

  /**
   * The max capacity is 16 megabytes.
   */
  public static MAX_INPUT_BUFFER_SIZE: number = 1024 * 1024 * 16;

  /**
   * The minimal capacity is 8 bytes.
   */
  public static SHARED_INPUT_BUFFER: ByteBuffer = new ByteBuffer({
    capacity: 1024,
  });

  constructor(wasm: TrieWasmModule, storage?: TrieStorage) {
    WasmContext.SHARED_INPUT_BUFFER.cursor = 0;
    this.instance = wasm;
    this.memory = new Uint8Array(wasm.memory.buffer);
    this.storage = storage ?? new DefaultTrieStorage();
    this.inputLen = 0;
    this.initialState = new Uint8Array(this.memory.length);
    this.initialState.set(this.memory);
    this.merkleRoot = new Uint8Array(32);
    this._updateRoot();
  }

  private _updateRoot(): void {
    this.reset();
    HostFn.attach(this);
    const ptr = BigInt.asUintN(64, this.instance.__ext_call(4, this.inputLen));
    const len = Number(BigInt.asUintN(32, ptr));
    const offset = Number(ptr >> 32n);
    const root = this.memory.subarray(offset, offset + len);
    this.merkleRoot.set(root);
  }

  private _readMemory(ptr: bigint): Uint8Array | undefined {
    if (ptr === 0n) {
      // For this specific wasm binary, the convetion
      // is that ptr === 0n means NULL or undefined.
      return undefined;
    }
    ptr = ptr < 0n ? BigInt.asUintN(64, ptr) : ptr;
    const len: bigint = BigInt.asUintN(32, ptr);
    const begin: bigint = ptr >> 32n;
    const end: bigint = begin + len;
    const memSize: bigint = BigInt(this.memory.length);
    if (end >= memSize) {
      throw new Error(
        `memory out of bounds!, memory size: ${memSize}, ptr[${begin}:${end}]`,
      );
    }
    return this.memory.subarray(Number(begin), Number(end));
  }

  private _call(code: number, inputLen: number): bigint {
    this.inputLen = inputLen;
    HostFn.attach(this);
    const ptr = this.instance.__ext_call(code, inputLen);
    this.inputLen = 0;
    return ptr;
  }

  public root(): Uint8Array {
    this._updateRoot();
    return this.merkleRoot.slice();
  }

  public insert(key: Key, value: Key): void {
    this.reset();
    const buffer = WasmContext.SHARED_INPUT_BUFFER;
    buffer.cursor = 0;
    const keyEncoded = key2bytes(key);
    buffer.writeU32(keyEncoded.length, true);
    buffer.writeU8List(keyEncoded);
    const valueEncoded = key2bytes(value);
    buffer.writeU32(valueEncoded.length, true);
    buffer.writeU8List(valueEncoded);
    this._call(0, buffer.cursor);
    this._updateRoot();
  }

  public remove(key: Key): void {
    this.reset();
    const buffer = WasmContext.SHARED_INPUT_BUFFER;
    buffer.cursor = 0;
    buffer.writeU8List(key2bytes(key));
    this._call(1, buffer.cursor);
    this._updateRoot();
  }

  public contains(key: Key): boolean {
    this.reset();
    const buffer = WasmContext.SHARED_INPUT_BUFFER;
    buffer.cursor = 0;
    buffer.writeU8List(key2bytes(key));
    return this._call(2, buffer.cursor) == 1n;
  }

  public get(key: Key): Uint8Array | undefined {
    this.reset();
    const buffer = WasmContext.SHARED_INPUT_BUFFER;
    buffer.cursor = 0;
    buffer.writeU8List(key2bytes(key));
    const ptr = this._call(3, buffer.cursor);
    const memorySlice = this._readMemory(ptr);
    if (memorySlice === undefined) {
      return undefined;
    }
    return memorySlice.slice();
  }

  public values(): JSMerklePatriciaTrie {
    this.reset();
    return this.instance.__ext_list_nodes();
  }

  public getStorage(): TrieStorage {
    return this.storage;
  }

  private reset() {
    const memory = this.getMemory();
    memory.set(this.initialState);
    if (memory.length > this.initialState.length) {
      memory.fill(0, this.initialState.length, memory.length);
    }
    WasmContext.SHARED_INPUT_BUFFER.cursor = 0;
  }

  getMemory(): Uint8Array {
    if (this.memory.byteLength === 0) {
      this.memory = new Uint8Array(this.instance.memory.buffer);
    }
    return this.memory;
  }
}
