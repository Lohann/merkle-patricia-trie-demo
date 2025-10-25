/// <reference types="react" />
declare namespace React {
  /*
   * Helper method that guarantees that the returned value only uses
   * values provided in the second parameter `CTX`. This helps preventing
   * non-determisn bugs.
   */
  export function usePure<R, CTX extends DependencyList>(
    factory: (input: CTX) => R,
    ctx: CTX,
  ): R;

  export function useLazyOnce<R, CTX extends DependencyList>(
    factory: (input: CTX) => R,
    ctx: CTX,
  ): R | undefined;

  export function useInitOnce<R, CTX extends React.DependencyList>(
    init: (input: CTX) => R,
    deps: CTX,
  ): R;

  export function useInitOnce<R, CTX extends React.DependencyList>(
    tryInit: (input: CTX) => R | undefined,
    deps: CTX,
  ): R | undefined;
}
