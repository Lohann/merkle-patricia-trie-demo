import { createSandbox } from "./sandbox.ts";
import { encodeHex } from "./encoder.ts";
import { type WasmContext } from "@scoped/trie-wasm-bindings";
import { type Command, Commands } from "../reducers/index.ts";
import {
  bindStateToStorage,
  type State as TrieState,
} from "../reducers/trie.ts";
import { TransientStorage } from "../reducers/transientStorage.ts";
import { type Entry, EntryCache } from "./cache.ts";

/**
 * Runtime state available inside the
 */
export class RuntimeContext {
  /**
   * Each time we interact with the wasm binary, the values must
   * be converted to Uint8Array, this temporary caches the bytes
   * converted between native to bytes.
   */
  static readonly CACHE: EntryCache = new EntryCache();

  /**
   * Transient storage for raw encoded trie nodes.
   */
  #rawStorage: TransientStorage;

  /**
   * Transient storage for key/value entries.
   */
  #keyValueStorage: Map<string, unknown>;

  /**
   * Merkle Patricia Trie WebAssembly instance.
   */
  #wasm: WasmContext;

  /**
   * Global state.
   */
  #state: TrieState;

  /**
   * Global state.
   */
  #cache: EntryCache;

  constructor(state: TrieState, wasm: WasmContext) {
    this.#keyValueStorage = new Map();
    this.#wasm = wasm;
    this.#rawStorage = bindStateToStorage(state, wasm);
    this.#state = state;
    this.#cache = RuntimeContext.CACHE;
  }

  #extractCommands(): Command[] {
    const changes: Command[] = [];
    this.#keyValueStorage.entries().forEach(([key, rawValue]) => {
      let portableKey: Entry = this.#cache.getOrCache(key);

      if (typeof key === "string") {
        portableKey = Object.freeze([key, portableKey[1]]);
      }

      if (rawValue !== undefined) {
        const [valHex, valRaw]: Entry = this.#cache.getOrCache(rawValue);
        const val = typeof rawValue === "string" ? rawValue : encodeHex(valRaw);
        const portableValue: Entry = Object.freeze([
          val,
          valRaw,
        ]);
        const oldValue = this.#state.values.map.get(key);
        if (oldValue === undefined || oldValue[1].val.hex !== valHex) {
          changes.push(
            Commands.trie.insert(this.#wasm, portableKey, portableValue),
          );
        }
      } else {
        const keyToRemove = this.#state.values.map.get(key);
        if (keyToRemove) {
          changes.unshift(Commands.trie.delete(this.#wasm, keyToRemove[1].key));
        }
      }
    });
    return changes;
  }

  updateTrie(_key: unknown, _value: unknown): void {
    const [key, keyBytes] = this.#cache.getOrCache(_key);
    const [, valBytes] = this.#cache.getOrCache(_value);
    if (_value === undefined) {
      this.#wasm.remove(keyBytes);
      this.#keyValueStorage.delete(key);
    } else {
      this.#wasm.insert(keyBytes, valBytes);
      this.#keyValueStorage.set(key, _value);
    }
  }
  insert(key: unknown, val: unknown): void {
    if (val === undefined) {
      throw new Error(
        "cannot store undefined, use `trie.remove(key)` instead.",
      );
    }
    const [keyHex, keyBytes] = this.#cache.getOrCache(key);
    const [, valBytes] = this.#cache.getOrCache(key);
    this.#wasm.insert(keyBytes, valBytes);
    this.#keyValueStorage.set(keyHex, val);
  }
  remove(key: unknown): void {
    this.updateTrie(key, undefined);
  }
  contains(key: unknown): boolean {
    const [, keyBytes] = this.#cache.getOrCache(key);
    return this.#wasm.contains(keyBytes);
  }
  get(key: unknown): unknown {
    const [keyHex] = this.#cache.getOrCache(key);
    return this.#keyValueStorage.get(keyHex);
  }
  getRaw(key: unknown): Uint8Array | undefined {
    const [, keyBytes] = this.#cache.getOrCache(key);
    return this.#wasm.get(keyBytes);
  }
  root(): string {
    return this.#rawStorage.merkleRoot();
  }
  runCode(code: string): Command[] {
    // trie object available inside the sandbox.
    const trie = Object.freeze({
      insert: (key: unknown, val: unknown): void => this.insert(key, val),
      remove: (key: unknown): void => this.remove(key),
      contains: (key: unknown): boolean => this.contains(key),
      get: (key: unknown): unknown => this.get(key),
      getRaw: (key: unknown): Uint8Array | undefined => this.getRaw(key),
      root: (): string => this.root(),
    });

    const sandbox = createSandbox(code, { trie });

    if (sandbox === undefined) {
      // The javascript is invalid, a message was printed
      // in the console.
      return [];
    }

    try {
      // Execute the sandox
      sandbox();
    } catch (error) {
      console.error(error);
      this.#cache.clear();
      globalThis.alert(`code execution failed:\n${error}`);
      return [];
    }
    // IMPORTANT: Clear the cache only after extract
    // the commands.
    const commands: Command[] = this.#extractCommands();
    this.#cache.clear();
    return commands;
  }
}

/**
 * Runs the provided `code` using the binary at `wasm`
 * and `state`.
 */
export const runCode = (
  code: string,
  wasm: WasmContext,
  state: TrieState,
): Command[] => {
  const runtime = new RuntimeContext(state, wasm);
  return runtime.runCode(code);
};
