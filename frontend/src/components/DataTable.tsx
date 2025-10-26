// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import React from "react";
import { Slab } from "@scoped/utils";
import { type MapState } from "../reducers/enumerableMap.ts";
import { type PortableEntry, type SelectedNodes } from "../reducers/trie.ts";

export interface DataTableProps {
  state: MapState<PortableEntry>;
  selected: SelectedNodes;
  onCreate: (key: string, value: string) => void;
  onDelete: (key: PortableEntry) => void;
  onSelect: (entry: PortableEntry, value: string) => void;
  onDeselect: (entry: PortableEntry) => void;
}
const inputClass =
  "block w-full rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm invalid:border-pink-500 invalid:text-pink-600 focus:border-sky-500 focus:outline focus:outline-sky-500 focus:invalid:border-pink-500 focus:invalid:outline-pink-500 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500 disabled:shadow-none sm:text-sm dark:disabled:border-gray-700 dark:disabled:bg-gray-800/20";
type DataTableRow = ([id: number, key: string, value: string])[];
type DataTableState = [Slab, DataTableRow[]];

function DataTable(
  { state, selected, onCreate, onDelete, onSelect, onDeselect }: DataTableProps,
) {
  const [form, setForm] = React.useState(
    function (): [key: string, value: string] {
      return ["", ""];
    },
  );

  function onFormChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const { name, value } = event.target;
    switch (name) {
      case "key": {
        setForm([value, form[1]]);
        break;
      }
      case "value": {
        setForm([form[0], value]);
        break;
      }
    }
  }

  function handleAdd(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    const [key, value] = form;
    const oldVal = state.map.get(key);
    if (oldVal && oldVal![1].val.val === value) {
      return;
    }
    onCreate(key, value);
    setForm(["", ""]);
  }

  function handleDelete(
    ev: React.MouseEvent<HTMLAnchorElement>,
    key: string,
  ): void {
    ev.preventDefault();
    const entry = state.map.get(key);
    if (entry) {
      onDelete(entry[1]);
    }
  }

  let enableAdd = form[0].length > 0 || form[1].length > 0;
  if (enableAdd) {
    const entry = state.map.get(form[0]);
    if (entry && entry[1].val.hex === form[1]) {
      enableAdd = false;
    }
  }
  // flow-root
  return (
    <div className="block">
      <div className="inline-block min-w-full align-middle">
        <div className="overflow-auto shadow-sm outline dark:outline-[#0000000d] dark:shadow-none -outline-offset-1 light:outline-neutral-950 h-[30vh]">
          <table className="relative min-w-full divide-y-1 divide-gray-300 dark:divide-white/15 border-collpase">
            <colgroup>
              <col />
              <col />
              <col width="0*" />
            </colgroup>
            <thead className="bg-gray-50  dark:bg-[#1a2534] sticky top-0 border-none">
              <tr className="sticky top-0">
                <th
                  scope="col"
                  className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6 dark:text-gray-200 sticky top-0"
                >
                  Key
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200 sticky top-0"
                >
                  Value
                </th>
                <th
                  scope="col"
                  className="py-3.5 pr-4 pl-3 sm:pr-8 w-1/100 sticky top-0"
                >
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
              <tr>
                <th
                  className="h-[1px] p-0 m-0 sticky top-0 bg-[#2e3745]"
                  colSpan={3}
                >
                </th>
              </tr>
            </thead>
            <tbody className="divide-y-1 divide-gray-300 bg-white dark:divide-white/10 dark:bg-gray-800/50">
              {Array.from(state.map.entries()).map(([key, [id, value]]) => (
                <DataTableRow
                  key={id}
                  value={value}
                  status={selected.get(value.key.hex)}
                  onDelete={onDelete}
                  onSelect={onSelect}
                  onDeselect={onDeselect}
                />
              ))}
              <tr>
                <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-6 dark:text-white mb-4">
                  <label
                    htmlFor="form-key"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  />
                  <input
                    id="form-key"
                    className={inputClass}
                    type="text"
                    name="key"
                    value={form[0]}
                    onChange={onFormChange}
                    autoComplete="off"
                  />
                </td>
                <td className="py-4 px-3 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                  <label
                    htmlFor="form-value"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    <input
                      id="form-value"
                      className={inputClass}
                      type="text"
                      name="value"
                      value={form[1]}
                      onChange={onFormChange}
                      autoComplete="off"
                    />
                  </label>
                </td>
                <td className="py-4 pr-4 pl-3 text-center text-sm font-medium whitespace-nowrap sm:pr-6 w-1/100">
                  <div className="m-0 sm:mt-0 sm:ml-0 sm:flex-none context-center">
                    <button
                      type="button"
                      onClick={handleAdd}
                      className="button"
                      disabled={!enableAdd}
                    >
                      Add
                    </button>
                  </div>
                </td>
              </tr>
              {
                /* <tr>
                <td
                  colSpan={3}
                  className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-6 dark:text-white"
                >
                  <div className="m-0 sm:mt-0 sm:ml-0 sm:flex-none context-center">
                    <button
                      type="button"
                      disabled
                      className="button"
                    >
                      Add
                    </button>
                  </div>
                </td>
              </tr> */
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface DataTableRowProps {
  value: PortableEntry;
  status?: string;
  onDelete: (entry: PortableEntry) => void;
  onSelect: (entry: PortableEntry, value: string) => void;
  onDeselect: (entry: PortableEntry) => void;
}

function DataTableRow(
  { value, status, onDelete, onSelect, onDeselect }: DataTableRowProps,
) {
  const handleDelete = (ev: React.MouseEvent<HTMLAnchorElement>) => {
    ev.preventDefault();
    onDelete(value);
  };
  const handleSelect = (ev: React.MouseEvent<HTMLTableCellElement>) => {
    ev.preventDefault();
    onSelect(value, "red");
  };
  const handleDeselect = (ev: React.MouseEvent<HTMLTableCellElement>) => {
    ev.preventDefault();
    onDeselect(value);
  };

  const style = status ? { backgroundColor: "#615fff" } : undefined;

  return (
    <tr style={style}>
      <td
        className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-6 dark:text-white"
        onMouseEnter={handleSelect}
        onMouseLeave={handleDeselect}
      >
        {value.key.val}
      </td>
      <td
        className="py-4 px-3 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400"
        onMouseEnter={handleSelect}
        onMouseLeave={handleDeselect}
      >
        {value.val.val}
      </td>
      <td className="py-4 pr-4 pl-3 text-center text-sm font-medium whitespace-nowrap sm:pr-6 w-1/100">
        <a
          href="#"
          className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
          onClick={handleDelete}
        >
          Delete
          <span className="sr-only">, {value.key.val}</span>
        </a>
      </td>
    </tr>
  );
}

export default DataTable;
