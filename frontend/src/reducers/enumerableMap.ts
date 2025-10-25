// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { Map, Record, type RecordOf } from "immutable";
export type MapValueOf<V> = readonly [id: number, value: V];
export type MapEntryOf<V> = readonly [key: string, val: MapValueOf<V>];

export interface MutableMapState<V> {
  sequence: number;
  map: Map<string, MapValueOf<V>>;
}

export type MapState<V> = RecordOf<MutableMapState<V>>;

// deno-lint-ignore no-explicit-any
const defaultInner: MutableMapState<any> = {
  sequence: 0,
  map: Map(),
};
// deno-lint-ignore no-explicit-any
const MapStateFactory: Record.Factory<MutableMapState<any>> = Record(
  defaultInner,
  "MapStateFactory",
);

export function initState<V>(
  entries?: { readonly [key: string]: V } | null,
): MapState<V> {
  let sequence = 0;
  if (entries) {
    const newEntries: MapEntryOf<V>[] = Object.entries(entries).map(
      ([key, value]) => {
        const mapValue: MapValueOf<V> = Object.freeze([sequence, value]);
        const mapEntry: MapEntryOf<V> = Object.freeze([key, mapValue]);
        sequence++;
        return mapEntry;
      },
    );
    const newMap: Map<string, readonly [id: number, value: V]> = Map(
      newEntries,
    );
    return MapStateFactory({
      sequence,
      map: newMap,
    });
  }
  return MapStateFactory({
    sequence: 0,
    map: Map(),
  });
}

export class MapActions {
  static setOne<V>(
    state: MapState<V>,
    key: string,
    value: V,
  ): MapState<V> {
    const entry: MapValueOf<V> | undefined = state.map.get(key);
    let newEntry: MapValueOf<V>;
    let newSequence = state.sequence;
    if (entry) {
      if (entry[1] === value) {
        // No change
        return state;
      }
      // value changed
      newEntry = Object.freeze([entry[0], value]);
    } else {
      // new value
      newEntry = Object.freeze([newSequence, value]);
      newSequence++;
    }
    const newMap = Map<string, MapValueOf<V>>({ [key]: newEntry }).merge(
      state.map,
    );
    // const newMap: Map<string, MapValueOf<V>> = state.map.set(key, newEntry);
    const newState: MutableMapState<V> = {
      sequence: newSequence,
      map: newMap,
    };
    return MapStateFactory(newState);
  }

  static set<V>(
    state: MapState<V>,
    entries: { readonly [key: string]: V | null },
  ): MapState<V> {
    let newSequence = state.sequence;
    const newMap = state.map.withMutations(
      (map: Map<string, MapValueOf<V>>) => {
        Object.entries(entries).forEach(([key, value]) => {
          if (value === null) {
            map.delete(key);
            return;
          }
          const mapValue: MapValueOf<V> | undefined = map.get(key);
          if (mapValue) {
            const id = mapValue[0];
            map.set(key, Object.freeze([id, value]));
          } else {
            map.set(key, Object.freeze([newSequence, value]));
            newSequence++;
          }
        });
      },
    );
    const newState: MutableMapState<V> = {
      sequence: newSequence,
      map: newMap,
    };
    return MapStateFactory(newState);
  }

  static remove<V>(
    state: MapState<V>,
    key: string,
  ): MapState<V> {
    if (!state.map.has(key)) {
      return state;
    }
    const newState: MutableMapState<V> = {
      sequence: state.sequence,
      map: state.map.delete(key),
    };
    return MapStateFactory(newState);
  }
}
