// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Immutable from "immutable";
import * as trie from "./trie.ts";
import * as editor from "./editor.ts";
export { type PortableValue, PortableValueFactory } from "./trie.ts";

/****************
 *     State    *
 ****************/
export interface RootState {
  trie: trie.State;
  editor: editor.State;
}
export type State = Immutable.RecordOf<RootState>;

/*****************
 * State Factory *
 *****************/
const StateFactory: Immutable.Record.Factory<RootState> = (function () {
  // Initial State
  const initialState: RootState = Object.freeze({
    trie: trie.initState(),
    editor: editor.initState(),
  });

  return Immutable.Record<RootState>(initialState, "RootState");
})();

/****************
 *   Commands   *
 ****************/
export type TrieCommand = readonly [prefix: "trie", command: trie.Command];
export type EditorCommand = readonly [
  prefix: "editor",
  command: editor.Command,
];
export type Command = TrieCommand | EditorCommand;

export const Commands = Object.freeze({
  editor: Object.freeze({
    setEditor(editorArg: editor.IStandaloneCodeEditor): EditorCommand {
      return Object.freeze(["editor", editor.Commands.setEditor(editorArg)]);
    },
    disposeEditor(editorArg?: editor.IStandaloneCodeEditor): EditorCommand {
      return Object.freeze([
        "editor",
        editor.Commands.disposeEditor(editorArg),
      ]);
    },
    runCode(code: string): EditorCommand {
      return Object.freeze(["editor", editor.Commands.runCode(code)]);
    },
  }),
  trie: Object.freeze({
    delete(wasm: trie.WasmContext, key: trie.PortableValue): TrieCommand {
      return Object.freeze(["trie", trie.Commands.delete(wasm, key)]);
    },
    insert(
      wasm: trie.WasmContext,
      key: readonly [string, Uint8Array],
      value: readonly [string, Uint8Array],
    ): TrieCommand {
      return Object.freeze([
        "trie",
        trie.Commands.insert(wasm, key, value),
      ]);
    },
    highlight(
      nodes: { readonly [key: string]: string | undefined },
    ): TrieCommand {
      return Object.freeze([
        "trie",
        trie.Commands.highlight(nodes),
      ]);
    },
  }),
});

/****************
 *    Reducer   *
 ****************/
export const initialState: State = StateFactory();
export const initState = (): State => initialState;

export const reducer = (
  state: State,
  [prefix, command]: Command,
): State => {
  switch (prefix) {
    case "editor": {
      const newState = editor.reducer(state.editor, command);
      // console.log(command, difference(newState, state.editor));
      if (state.editor === newState) return state;
      return state.set(prefix, newState);
    }
    case "trie": {
      const newState = trie.reducer(state.trie, command);
      // console.log('DIFFERENCE:', difference(newState, state.trie));
      if (state.trie === newState) return state;
      return state.set(prefix, newState);
    }
  }
  throw new Error(`unknown prefix ${prefix}`);
};

// export const reducer = (
//   state: State,
//   command: Command,
// ): State => {
//   const newState = _reducer(state, command);
//   const prev = state.trie.selected;
//   const next = newState.trie.selected;
//   if (Immutable.is(prev, next)) {
//     console.log(
//       command,
//       "NO CHANGES",
//       Immutable.hash(prev),
//       Immutable.hash(next),
//     );
//   } else {
//     console.log(
//       command,
//       "CHANGED",
//       Immutable.hash(prev),
//       Immutable.hash(next),
//       next.toJS(),
//     );
//   }
//   return newState;
// };
