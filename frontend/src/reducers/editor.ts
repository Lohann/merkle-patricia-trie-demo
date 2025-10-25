// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Immutable from "immutable";
import { type BaseCommand } from "./common.ts";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

export type IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;
export type Config = monaco.editor.IStandaloneEditorConstructionOptions;

/*******************
 * EDITOR SETTINGS *
 *******************/
const CODE = `"use strict";

console.log("ROOT:", trie.root());
const values = {
  "0xaabbcc": 1,
  "0xaabbccde": 2,
  "0xbbccddeeff": 3,
  "0xbbeeddeeee": 4,
  "0xcceeff": 5,
  "0xffffffff": "0xdeadbeef",
};

Object.entries(values).forEach(([key,value]) => {
  trie.insert(key, value);
  console.log(trie.root());
});
`;

const LIB_URI = "ts:filename/trie.d.ts";
const LIB_SOURCE = `
interface ArrayBufferView {
    /**
     * The ArrayBuffer instance referenced by the array.
     */
    readonly buffer: ArrayBuffer;

    /**
     * The length in bytes of the array.
     */
    readonly byteLength: number;

    /**
     * The offset in bytes of the array.
     */
    readonly byteOffset: number;
}

declare class MerklePatriciaTrie {
  /**
   * inserts a new key-value in the merkle patricia trie
   */
	insert(key: string | number | ArrayBufferView, value?: string | number | ArrayBufferView | null): void;

  /**
   * removes a key from merkle patricia trie
   */
	remove(key: string | number | ArrayBufferView): void;

  /**
   * get the value stored at the given key
   */
	get(key: string | number | ArrayBufferView): string;

  /**
   * get the value stored at the given key
   */
	contains(key: string | number | ArrayBufferView): boolean;

  /**
   * returns the current Merkle Root
   */
	root(): string;
}
declare const trie: MerklePatriciaTrie;
declare class Facts {
  /**
   * Returns the next fact
   */
  static next():string
}
`;

let _configured = false;
function configureEditor() {
  if (_configured) return;
  _configured = true;

  // validation settings
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  // compiler options
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2015,
    allowNonTsExtensions: true,
  });
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    LIB_SOURCE,
    LIB_URI,
  );
  // When resolving definitions and references, the editor will try to use created models.
  // Creating a model for the library allows "peek definition/references" commands to work with the library.
  monaco.editor.createModel(
    LIB_SOURCE,
    "typescript",
    monaco.Uri.parse(LIB_URI),
  );
}
setTimeout(() => configureEditor, 1);

/****************
 *     State    *
 ****************/
type EditorState = {
  editor?: IStandaloneCodeEditor;
  config: Config;
};
export type State = Immutable.RecordOf<EditorState>;

/*****************
 * State Factory *
 *****************/
const StateFactory: Immutable.Record.Factory<EditorState> = (function () {
  // Initial State
  let code: string = CODE;
  try {
    const localCode = localStorage.getItem("code");
    if (localCode && localCode.trim().length > 0) {
      code = localCode;
    }
  } catch (_err) {}
  const initialState: EditorState = Object.freeze({
    editor: undefined,
    config: {
      value: code,
      language: "typescript",
      theme: "vs-dark",
      lineNumbers: "on",
      automaticLayout: true,
      minimap: { enabled: false },
      scrollbar: {
        // Subtle shadows to the left & top. Defaults to true.
        useShadows: false,

        // Render vertical arrows. Defaults to false.
        verticalHasArrows: true,
        // Render horizontal arrows. Defaults to false.
        horizontalHasArrows: true,

        // Render vertical scrollbar.
        // Accepted values: 'auto', 'visible', 'hidden'.
        // Defaults to 'auto'
        vertical: "visible",
        // Render horizontal scrollbar.
        // Accepted values: 'auto', 'visible', 'hidden'.
        // Defaults to 'auto'
        horizontal: "visible",

        verticalScrollbarSize: 17,
        horizontalScrollbarSize: 17,
        arrowSize: 30,
      },
    },
  });

  return Immutable.Record<EditorState>(initialState, "EditorState");
})();

/****************
 *   Commands   *
 ****************/
export type Command = SetEditorCommand | DisposeEditorCommand | RunCodeCommand;

export interface SetEditorCommand extends BaseCommand {
  type: "editor.setEditor";
  editor: IStandaloneCodeEditor;
}

export interface DisposeEditorCommand extends BaseCommand {
  type: "editor.dipose";
  editor?: IStandaloneCodeEditor;
}

export interface RunCodeCommand extends BaseCommand {
  type: "editor.runCode";
  code: string;
}

export class Commands {
  static prefix: string = "editor.";

  static setEditor(editor: IStandaloneCodeEditor): SetEditorCommand {
    return Object.freeze({
      type: "editor.setEditor",
      editor: editor,
    });
  }

  static disposeEditor(editor?: IStandaloneCodeEditor): DisposeEditorCommand {
    return Object.freeze({
      type: "editor.dipose",
      editor: editor,
    });
  }

  static runCode(code: string): RunCodeCommand {
    return Object.freeze({ type: "editor.runCode", code });
  }
}

/*****************
 *    Reducer    *
 *****************/
export function initState(): State {
  return StateFactory();
}

export function reducer(
  state: State,
  command: Command,
): State {
  if (!command.type.startsWith("editor.")) {
    return state;
  }
  switch (command.type) {
    case "editor.setEditor": {
      configureEditor();
      return state.set("editor", command.editor);
    }
    case "editor.runCode": {
      localStorage.setItem("code", command.code);
      return state;
    }
  }
  throw new Error("unknown command type");
}
