// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import React from "react";
import "../utils/index.js";
import { value2bytes } from "../utils/encoder.ts";
import { RuntimeContext } from "../utils/runcode.ts";
import DataTable from "./DataTable.tsx";
import Cluster from "./Cluster.tsx";
import { type WasmContext } from "@scoped/trie-wasm-bindings";
import {
  type Command,
  Commands,
  initialState,
  reducer,
  type State,
} from "../reducers/index.ts";
import { PortableEntry, type State as TrieState } from "../reducers/trie.ts";
import { Editor, type IStandaloneCodeEditor } from "./Editor.tsx";

export type DataNode = ValueNode | BranchNode;

export interface ValueNode {
  name: string;
  size: number;
}

export interface BranchNode {
  name: string;
  children: DataNode[];
}
interface MerkleTrieProps {
  context: WasmContext;
}

export interface MerkleTrieHandlers {
  timeoutHandler: number | null;
  dispatch: React.ActionDispatch<[Command]>;
  onCreate: (key: string, value: string) => void;
  onDelete: (key: PortableEntry) => void;
  onSelect: (key: PortableEntry, value: string) => void;
  onDeselect: (key: PortableEntry) => void;
}

export interface RunCodeHandlers extends MerkleTrieHandlers {
  runCodeHandler: React.MouseEventHandler<HTMLButtonElement>;
}

function toPortable(val: string): readonly [string, Uint8Array] {
  const raw = value2bytes(val);
  return Object.freeze([val, raw]);
}

export type ActionDispatcher = [
  // editor: IStandaloneCodeEditor | undefined,
  context: WasmContext,
  dispatch: React.ActionDispatch<[Command]>,
];

const PENDING_SELECT_DELAY: number = 10;
const PENDING_SELECT: Map<string, string | null> = new Map();

const updatePendingSelect = (handlers: MerkleTrieHandlers): void => {
  if (handlers.timeoutHandler !== null) return;
  const callback = () => {
    handlers.timeoutHandler = null;
    PENDING_SELECT.entries().forEach(([key, value]) => {
      const data: { [key: string]: string | undefined } = Object.freeze({
        [key]: value === null ? undefined : value,
      });
      handlers.dispatch(Commands.trie.highlight(data));
    });
    PENDING_SELECT.clear();
  };
  handlers.timeoutHandler = globalThis.setTimeout(
    callback,
    PENDING_SELECT_DELAY,
  );
};

function handlersFactory(
  [wasm, dispatch]: ActionDispatcher,
): MerkleTrieHandlers {
  PENDING_SELECT.clear();
  const self: MerkleTrieHandlers = {
    timeoutHandler: null,
    dispatch,
    onCreate: (key: string, value: string): void => {
      const action = Commands.trie.insert(
        wasm,
        toPortable(key),
        toPortable(value),
      );
      dispatch(action);
    },

    /**
     * Triggered when `Remove` button is pressed.
     * @param event
     */
    onDelete: (entry: PortableEntry): void => {
      const action = Commands.trie.delete(wasm, entry.key);
      dispatch(action);
    },

    /**
     * Triggered when `Remove` button is pressed.
     * @param event
     */
    onSelect: (entry: PortableEntry, value: string): void => {
      PENDING_SELECT.set(entry.key.hex, value);
      updatePendingSelect(self);
    },

    /**
     * Triggered when `Remove` button is pressed.
     * @param event
     */
    onDeselect: (entry: PortableEntry): void => {
      PENDING_SELECT.set(entry.key.hex, null);
      updatePendingSelect(self);
    },
  };
  return self;
}

type RunCodeArgs = [
  WasmContext,
  TrieState,
  IStandaloneCodeEditor | undefined,
  React.Dispatch<Command>,
];

/**
 * Triggered when `Run Code` button is pressed.
 * @param event
 */
function runCodeHandler(
  args: RunCodeArgs,
  event: React.MouseEvent<HTMLButtonElement>,
): void {
  const [wasm, state, editor, dispatch] = args;
  event.stopPropagation();
  if (editor === undefined) return;
  const code = editor.getValue();
  const runtime = new RuntimeContext(state, wasm);

  // Save Code
  dispatch(Commands.editor.runCode(code));

  // Run the code
  const commands = runtime.runCode(code);

  // Execute commands
  commands.forEach((command) => {
    dispatch(command);
  });
}

function initialize(
  context: WasmContext,
): [State, React.Dispatch<Command>, RunCodeHandlers] {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const actions = React.usePure(handlersFactory, [context, dispatch]);
  const deps: RunCodeArgs = [
    context,
    state.trie,
    state.editor.editor,
    dispatch,
  ];
  const handler = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      runCodeHandler(deps, event);
    },
    deps,
  );
  return [state, dispatch, { ...actions, runCodeHandler: handler }];
}

function MerklePatriciaTrie({ context }: MerkleTrieProps) {
  const [state, dispatch, actions] = initialize(context);
  return (
    <div className="mx-auto min-w-full min-h-full overflow-hidden">
      <div className="grid grid-cols-12 gap-0 min-w-full h-screen overflow-hidden">
        <div className="col-span-7 h-screen overflow-hidden">
          <div className="flex flex-col w-full h-full overflow-hidden">
            <div className="grow-70 shrink basis-0 overflow-hidden">
              <div className="flex justify-center items-stretch flex-col h-full">
                <div className="flex shirnk-0 w-full border-b-1 bg-gray-50 dark:bg-gray-800/75 dark:border-white/15 border-gray-300">
                  <div className="flex justify-between items-center p-0 m-0 h-10 w-full">
                    <h1 className="shirnk-0 px-6 text-base font-semibold text-gray-900 dark:text-white">
                      Merkle Patricia Trie Demo
                    </h1>
                  </div>
                </div>
                <div className="h-full overflow-auto">
                  <Cluster
                    nodes={state.trie.nodes}
                    selected={state.trie.selected}
                    merkleRoot={state.trie.merkleRoot}
                    dispatch={dispatch}
                  />
                </div>
              </div>
            </div>
            <div className="grow-30 shrink basis-0 overflow-hidden">
              <div className="flex justify-center items-stretch flex-col h-full">
                <div className="h-full overflow-hidden">
                  <DataTable
                    state={state.trie.values}
                    selected={state.trie.selected}
                    onCreate={actions.onCreate}
                    onDelete={actions.onDelete}
                    onSelect={actions.onSelect}
                    onDeselect={actions.onDeselect}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-span-5 h-screen overflow-hidden">
          <div className="flex justify-center items-stretch flex-col h-full">
            <div className="flex shirnk-0 w-full border-b-1 bg-gray-50 dark:bg-gray-800/75 dark:border-white/15 border-gray-300">
              <div className="flex justify-between items-center p-0 m-0 h-10 w-full">
                <div className="shirnk-0 px-6">
                  <button
                    type="button"
                    className="button"
                    onClick={actions.runCodeHandler}
                  >
                    Run Code
                  </button>
                </div>
                <div className="shirnk-0 px-6">
                  {
                    /* <div
                    data-default-open=""
                    className="el-dropdown inline-block"
                  >
                    <button
                      type="button"
                      className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white inset-ring-1 inset-ring-white/5 hover:bg-white/20"
                    >
                      Examples
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        data-slot="icon"
                        aria-hidden="true"
                        className="-mr-1 size-5 text-gray-400"
                      >
                        <path
                          d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                          clipRule="evenodd"
                          fillRule="evenodd"
                        />
                      </svg>
                    </button>
                    <div
                      data-anchor="bottom end"
                      popover=""
                      className="el-menu w-56 origin-top-right rounded-md bg-gray-800 outline-1 -outline-offset-1 outline-white/10 transition transition-discrete [--anchor-gap:--spacing(2)] data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                    >
                      <div className="py-1">
                        <a
                          href="#"
                          className="block px-4 py-2 text-sm text-gray-300 focus:bg-white/5 focus:text-white focus:outline-hidden"
                        >
                          Account settings
                        </a>
                        <a
                          href="#"
                          className="block px-4 py-2 text-sm text-gray-300 focus:bg-white/5 focus:text-white focus:outline-hidden"
                        >
                          Support
                        </a>
                        <a
                          href="#"
                          className="block px-4 py-2 text-sm text-gray-300 focus:bg-white/5 focus:text-white focus:outline-hidden"
                        >
                          License
                        </a>
                        <form action="#" method="POST">
                          <button
                            type="submit"
                            className="block w-full px-4 py-2 text-left text-sm text-gray-300 focus:bg-white/5 focus:text-white focus:outline-hidden"
                          >
                            Sign out
                          </button>
                        </form>
                      </div>
                    </div>
                  </div> */
                  }
                </div>
              </div>
            </div>
            <div className="h-full overflow-auto">
              <Editor editor={state.editor} dispatch={dispatch} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MerklePatriciaTrie;
