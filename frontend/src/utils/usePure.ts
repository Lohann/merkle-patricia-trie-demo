// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { type DependencyList, useMemo } from "react";

/*
 * Helper method that guarantees that the returned value only uses
 * values provided in the second parameter `CTX`. This helps preventing
 * non-determisn bugs.
 */
export default function usePure<R, CTX extends DependencyList>(
  factory: (input: CTX) => R,
  ctx: CTX,
): R {
  return useMemo((): R => factory(ctx), ctx);
}
