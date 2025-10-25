import React from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "../utils/index.js";
import { type State as EditorState } from "../reducers/editor.ts";
import { type Command, Commands } from "../reducers/index.ts";

export type EditorOptions = monaco.editor.IStandaloneEditorConstructionOptions;
export type IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;

type EditorParams = [
  div: HTMLDivElement | null,
  editor: EditorState,
  dispatch: React.Dispatch<Command>,
];
/*  */
const _mediaQuery: MediaQueryList = globalThis.matchMedia(
  "(prefers-color-scheme: dark)",
);
function isThemeDark(): boolean {
  return _mediaQuery.matches;
}
function editorThemeListener(_event: MediaQueryListEvent): void {
  if (isThemeDark()) {
    monaco.editor.setTheme("vs-dark");
  } else {
    monaco.editor.setTheme("vs-light");
  }
}
function autoChangeEditorTheme(editor: monaco.editor.IStandaloneCodeEditor) {
  _mediaQuery.addEventListener("change", editorThemeListener);
  editor.onDidDispose(() => {
    if (_mediaQuery === null) return;
    _mediaQuery.removeEventListener("change", editorThemeListener);
  });
}
function monacoEditorInit(
  [div, { editor, config }, dispatch]: EditorParams,
): IStandaloneCodeEditor | undefined {
  if (div === null) return;
  if (editor !== undefined) {
    if (editor.getContainerDomNode() === div) return;
    try {
      editor.dispose();
    } catch (error) {
      console.error(error);
    }
  }

  const editorConfig: EditorOptions = { ...config };
  if (isThemeDark()) {
    editorConfig.theme = "vs-dark";
  } else {
    editorConfig.theme = "vs-light";
  }
  const newEditor: IStandaloneCodeEditor = monaco.editor.create(
    div,
    editorConfig,
  );
  autoChangeEditorTheme(newEditor);
  dispatch(Commands.editor.setEditor(newEditor));
  return newEditor;
}

// function onThemeChange(editor: IStandaloneCodeEditor) {
//     editor.
// }

export interface EditorProps {
  editor: EditorState;
  dispatch: React.ActionDispatch<[Command]>;
}

export const Editor: React.FC<EditorProps> = ({ editor, dispatch }) => {
  const [div, divRef] = React.useState<HTMLDivElement | null>(null);
  React.useLazyOnce(monacoEditorInit, [div, editor, dispatch]);
  return <div className="min-w-full min-h-full" ref={divRef}></div>;
};
