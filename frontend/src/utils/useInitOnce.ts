// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// deno-lint-ignore-file no-explicit-any
import React from "react";

// Reference:
// https://github.com/facebook/react/blob/v19.2.0/packages/shared/objectIs.js
let is: (value1: any, value2: any) => boolean = Object.is;
if (typeof is !== "function") {
  /**
   * inlined Object.is polyfill to avoid requiring consumers ship their own
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
   */
  is = (x: any, y: any) => {
    return (
      (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y) // eslint-disable-line no-self-compare
    );
  };
}

// Reference:
// https://github.com/facebook/react/blob/v19.2.0/packages/react-reconciler/src/ReactFiberHooks.js#L454-L501
function areHookInputsEqual(
  nextDeps: readonly any[],
  prevDeps: readonly any[] | null,
): boolean {
  if (prevDeps === null) {
    return false;
  }
  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    // $FlowFixMe[incompatible-use] found when upgrading Flow
    if (is(nextDeps[i], prevDeps[i])) continue;
    return false;
  }
  return true;
}

const IDLE_TAG: unique symbol = Symbol("useCallbackOnce.idle");
const PENDING_TAG: unique symbol = Symbol("useCallbackOnce.pending");
const DONE_TAG: unique symbol = Symbol("useCallbackOnce.done");

type IDLE = readonly [typeof IDLE_TAG, null, null];
type PENDING<C> = [typeof PENDING_TAG, null, C];
type DONE<T, C> = [typeof DONE_TAG, T, C];

type Status<T, C> = IDLE | PENDING<C> | DONE<T, C>;
const idle: IDLE = Object.freeze([IDLE_TAG, null, null]);

/*
 * Helper method that guarantees that the returned value only uses
 * values provided in the second parameter `CTX`. This helps preventing
 * non-determisn bugs.
 */
export default function useInitOnce<R, CTX extends React.DependencyList>(
  tryInit: (input: CTX) => R | undefined,
  deps: CTX,
): R | undefined {
  const prev: React.RefObject<Status<R, CTX>> = React.useRef<Status<R, CTX>>(
    idle,
  );
  const [tag, value, initDeps] = prev.current;
  switch (tag) {
    case DONE_TAG: {
      if (areHookInputsEqual(deps, initDeps)) {
        return value;
      }
      const val = tryInit(deps);
      if (val !== undefined) {
        prev.current[1] = val;
        prev.current[2] = deps;
        return val;
      }
      return value;
    }
    case PENDING_TAG:
    case IDLE_TAG: {
      if (areHookInputsEqual(deps, value)) {
        return undefined;
      }
      const val = tryInit(deps);
      if (val !== undefined) {
        prev.current = [DONE_TAG, val, deps];
        return val;
      } else if (tag === IDLE_TAG) {
        const val: PENDING<CTX> = [PENDING_TAG, null, deps];
        prev.current = val;
      } else {
        prev.current[2] = deps;
      }
      return undefined;
    }
    default:
      throw new Error("unknown tag");
  }
  // // deno-lint-ignore no-explicit-any
  // if (Array.isArray(prev) && areHookInputsEqual(ctx as any, prev)) {
  //     return usePure(() => true, ctx.concat(prev[1]));
  // }
  // return usePure(() => check(once, ctx, previous), ctx.concat(prev));
}
