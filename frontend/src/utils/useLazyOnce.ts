// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { type DependencyList, useRef } from "react";

const IDLE_TAG: unique symbol = Symbol("useLazy.idle");
const PENDING_TAG: unique symbol = Symbol("useLazy.pending");
const DONE_TAG: null = null;
type Idle = [typeof IDLE_TAG, null];
type Pending = [typeof PENDING_TAG, number];
type Done<T> = [typeof DONE_TAG, T];
const IDLE: Idle = [IDLE_TAG, null];
type Status<T> = Idle | Pending | Done<T>;

const _clearTimeout = globalThis.clearTimeout;
const _setTimeout = globalThis.setTimeout;

/*
 * Helper method that guarantees that the returned value only uses
 * values provided in the second parameter `CTX`. This helps preventing
 * non-determisn bugs.
 */
export default function useLazyOnce<R, CTX extends DependencyList>(
  factory: (input: CTX) => R,
  ctx: CTX,
): R | undefined {
  const lazyLoad = useRef<Status<R>>(IDLE);
  const [tag, value] = lazyLoad.current;
  switch (tag) {
    case DONE_TAG:
      return value;
    case PENDING_TAG:
    case IDLE_TAG: {
      if (tag === PENDING_TAG) {
        _clearTimeout(value);
      }
      const pending: Pending = [PENDING_TAG, 0];
      lazyLoad.current = pending;
      pending[1] = _setTimeout(function () {
        if (lazyLoad.current !== pending) {
          return;
        }
        lazyLoad.current = [null, factory(ctx)];
      });
      return undefined;
    }
    default: {
      throw new Error("[bug] invalid ref value");
    }
  }
}
