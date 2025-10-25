// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Immutable from "immutable";
import { type BaseCommand } from "./common.ts";
import { encodeHex } from "../utils/encoder.ts";
import {
  type JSMerklePatriciaTrie,
  WasmContext,
} from "../../../lib.exports.ts";
export {
  type JSMerklePatriciaTrie,
  WasmContext,
} from "../../../lib.exports.ts";
import {
  type StorageValue,
  TransientStorage,
  type TransientStorageHandler,
} from "./transientStorage.ts";
import {
  initState as initMap,
  MapActions,
  type MapState,
} from "./enumerableMap.ts";
import { type Nib } from "../../../nibbles.ts";
export { type Nib } from "../../../nibbles.ts";

/****************
 *     State    *
 ****************/
// export type Nib = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "A" | "B" | "C" | "D" | "E" | "F";
export type Children = { [key: Nib]: string };
export interface TrieNode {
  hash: string;
  nibbles?: string;
  value?: string;
  encoded: string;
  children: Children;
}

interface PortableValueFields {
  hex: string;
  raw: Uint8Array;
  val: string;
}
export type PortableValue = Immutable.RecordOf<PortableValueFields>;
export const PortableValueFactory: Immutable.Record.Factory<
  PortableValueFields
> = Immutable.Record<PortableValueFields>({
  hex: "0x",
  raw: new Uint8Array(0),
  val: "<missing>",
});

interface PortableEntryFields {
  key: PortableValue;
  val: PortableValue;
}
export type PortableEntry = Immutable.RecordOf<PortableEntryFields>;
export const PortableEntryFactory: Immutable.Record.Factory<
  PortableEntryFields
> = Immutable.Record<PortableEntryFields>({
  key: PortableValueFactory(),
  val: PortableValueFactory(),
});
export type SelectedNodes = Immutable.Map<string, string>;
interface TrieState {
  storage: MapState<StorageValue>;
  values: MapState<PortableEntry>;
  nodes: Immutable.Map<string, TrieNode>;
  selected: SelectedNodes;
  merkleRoot?: string;
}

export type State = Immutable.RecordOf<TrieState>;

/*****************
 * State Factory *
 *****************/
const StateFactory: Immutable.Record.Factory<TrieState> = (function () {
  // Initial State
  const initialState: TrieState = {
    storage: initMap(),
    values: initMap(),
    nodes: Immutable.Map(),
    selected: Immutable.Map(),
    merkleRoot: undefined,
  };

  return Immutable.Record<TrieState>(initialState, "TrieState");
})();
const initialState: State = StateFactory({
  storage: initMap(),
  values: initMap(),
  nodes: Immutable.Map(),
  merkleRoot: undefined,
});

/****************
 *   Commands   *
 ****************/
export type Command =
  | SetStorageCommand
  | DeleteKeyStorageCommand
  | ClearStorageCommand
  | HighlightNodesCommand;

export interface SetStorageCommand extends BaseCommand {
  type: "trie.set";
  key: readonly [string, Uint8Array];
  value: readonly [string, Uint8Array];
  wasm: WasmContext;
}

export interface DeleteKeyStorageCommand extends BaseCommand {
  type: "trie.delete";
  key: PortableValue;
  wasm: WasmContext;
}

export interface ClearStorageCommand extends BaseCommand {
  type: "trie.clear";
  wasm: WasmContext;
}

export interface HighlightNodesCommand extends BaseCommand {
  type: "trie.highlight";
  nodes: { readonly [key: string]: string | undefined };
}

export class Commands {
  private constructor() {}

  static insert(
    wasm: WasmContext,
    key: readonly [string, Uint8Array],
    value: readonly [string, Uint8Array],
  ): SetStorageCommand {
    return Object.freeze({
      type: "trie.set",
      key: key,
      value: value,
      wasm: wasm,
    });
  }

  static delete(
    wasm: WasmContext,
    key: PortableValue,
  ): DeleteKeyStorageCommand {
    return Object.freeze({ type: "trie.delete", wasm, key });
  }

  static clearStorage(wasm: WasmContext): ClearStorageCommand {
    return Object.freeze({ type: "trie.clear", wasm });
  }

  static highlight(
    nodes: { readonly [key: string]: string | undefined },
  ): HighlightNodesCommand {
    return Object.freeze({ type: "trie.highlight", nodes });
  }
}

/********************
 * Command Handlers *
 ********************/
export function bindStateToStorage(
  state: State,
  wasm: WasmContext,
): TransientStorage {
  wasm.storage = new TransientStorage();
  const merkleRoot: string = state.merkleRoot ?? encodeHex(wasm.root());
  const handler: TransientStorageHandler = function (
    key: string,
  ): StorageValue | undefined {
    const node = state.nodes.get(key);
    if (node) {
      return [1, node.encoded];
    }
    const entry = state.storage.map.get(key);
    if (entry) {
      return entry[1];
    }
  };
  const storage = wasm.storage as TransientStorage;
  storage.setHandler(merkleRoot, handler);
  return storage;
}

function updateSelected(
  values: MapState<PortableEntry>,
  selected: SelectedNodes,
): SelectedNodes {
  const deleteKeys = [];
  for (const key of selected.keys()) {
    if (!values.map.has(key)) {
      deleteKeys.push(key);
    }
  }
  if (deleteKeys.length === 0) return selected;
  return selected.removeAll(deleteKeys);
}

function handleSetStorage(
  state: State,
  wasm: WasmContext,
  _key: readonly [string, Uint8Array],
  _value: readonly [string, Uint8Array],
): State {
  const key: PortableValue = PortableValueFactory({
    hex: encodeHex(_key[1]),
    raw: _key[1],
    val: _key[0],
  });
  const value: PortableValue = PortableValueFactory({
    hex: encodeHex(_key[1]),
    raw: _value[1],
    val: _value[0],
  });
  const oldEntry = state.values.map.get(key.hex);
  if (oldEntry && oldEntry[1].val.hex === value.hex) {
    return state;
  }
  const store = bindStateToStorage(state, wasm);
  wasm.insert(key.raw, value.raw);
  const changes = store.getChanges();
  const newMerkleRoot = store.merkleRoot();
  const newEntries = MapActions.setOne<PortableEntry>(
    state.values,
    key.hex,
    PortableEntryFactory({ key, val: value }),
  );
  const newStorage = MapActions.set(state.storage, changes);
  const newNodes = Immutable.Map<string, TrieNode>().withMutations((nodes) => {
    trieWalk(nodes, wasm.values());
  });
  store.clear();
  return StateFactory({
    storage: newStorage,
    values: newEntries,
    nodes: newNodes,
    merkleRoot: newMerkleRoot,
    selected: updateSelected(newEntries, state.selected),
  });
}

function handleDeleteStorage(
  state: State,
  wasm: WasmContext,
  key: PortableValue,
): State {
  if (!state.values.map.has(key.hex)) {
    return state;
  }
  const store = bindStateToStorage(state, wasm);
  wasm.remove(key.raw);
  const changes = store.getChanges();
  const newMerkleRoot = store.merkleRoot();
  const newEntries = MapActions.remove<PortableEntry>(state.values, key.hex);
  const newStorage = MapActions.set(state.storage, changes);
  const newNodes = Immutable.Map<string, TrieNode>().withMutations((nodes) => {
    trieWalk(nodes, wasm.values());
  });
  store.clear();
  return StateFactory({
    storage: newStorage,
    values: newEntries,
    nodes: newNodes,
    merkleRoot: newMerkleRoot,
    selected: updateSelected(newEntries, state.selected),
  });
}

function selectedReducer(
  values: MapState<PortableEntry>,
  state: SelectedNodes,
  nodes: { readonly [key: string]: string | undefined },
): SelectedNodes {
  const selected: { [key: string]: string } = {};
  const deleted: string[] = [];
  Object.entries(nodes).forEach(([key, value]) => {
    if (!values.map.has(key)) return;
    if (value === undefined) {
      if (state.has(key)) {
        deleted.push(key);
      }
      return;
    }
    const oldVal = state.get(key);
    if (oldVal && oldVal === value) return;
    selected[key] = value;
  });
  if (deleted.length === 0 && Object.keys(selected).length === 0) return state;
  return state.withMutations((mutable) => {
    return mutable.deleteAll(deleted).merge(selected);
  });
}

function trieWalk(
  nodes: Immutable.Map<string, TrieNode>,
  next: JSMerklePatriciaTrie,
) {
  const encoded = next.raw_bytes!;
  const hash = next.id ?? encoded;
  if (hash && hash in nodes) {
    return;
  }
  const children: Children = next.children.toObject(([, child]) => {
    const id: string = child.id ?? child.raw_bytes!;
    return id;
  });
  const newNode: TrieNode = {
    hash: hash,
    nibbles: next.nibbles,
    value: next.value,
    encoded,
    children,
  };
  nodes.set(hash, newNode);
  for (const child of next.children.values) {
    const id: string = child.id ?? child.raw_bytes!;
    if (nodes.has(id)) {
      continue;
    }
    trieWalk(nodes, child);
  }
}

/*****************
 *    Reducer    *
 *****************/
export function initState(): State {
  return initialState;
}

export function reducer(state: State, command: Command): State {
  switch (command.type) {
    case "trie.set": {
      const { wasm, key, value } = command;
      return handleSetStorage(state, wasm, key, value);
    }
    case "trie.delete": {
      const { wasm, key } = command;
      return handleDeleteStorage(state, wasm, key);
    }
    case "trie.clear": {
      const { wasm } = command;
      const storage = bindStateToStorage(initialState, wasm);
      const merkleRoot = storage.merkleRoot();
      return initialState.set("merkleRoot", merkleRoot);
    }
    case "trie.highlight": {
      const { nodes } = command;
      const selected = selectedReducer(state.values, state.selected, nodes);
      if (selected === state.selected) return state;
      return state.set("selected", selected);
    }
  }
  throw new Error("unknown command type");
}
