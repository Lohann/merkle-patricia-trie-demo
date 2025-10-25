// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export const NIBS: readonly string[] = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
] as const;
Object.freeze(NIBS);
export type Nib = typeof NIBS[number];

const NIB_TABLE = new Uint8Array(128);
const NIB_LUT: { [key: string | number | Nib]: Nib } = {};
(function () {
  "use strict";
  const nibsUpperCase = NIBS.join("").toUpperCase();
  const nibsLowerCase = nibsUpperCase.toLowerCase();
  for (let i = 0; i < nibsUpperCase.length; i++) {
    // Make sure all valid nibbles are non-zero, to make
    // validation easier.
    const indexPlusOne = i + 1;
    NIB_TABLE[i] = indexPlusOne;
    NIB_TABLE[nibsLowerCase.charCodeAt(i)] = indexPlusOne;
    NIB_TABLE[nibsUpperCase.charCodeAt(i)] = indexPlusOne;
  }
  Object.freeze(NIB_LUT);
})();

// Any object can overwrite it's own `hasOwnProperty` method, that's
// why usage of `Object.prototype.hasOwnProperty.call(obj, prop)` is
// recommended.
const objectProto = Object.prototype;
const hasOwnPropertyProto = objectProto.hasOwnProperty;
const hasOwnProperty = (obj: object, prop: PropertyKey): boolean => {
  // this method throw an error when obj === null,
  // `Object.hasOwn` fixes this behavior, but is less portable.
  if (obj === null) return false;
  return hasOwnPropertyProto.call(obj, prop);
};
const TO_STRING_SYMBOL: typeof Symbol.toStringTag = Symbol.toStringTag;
const ITERATOR_SYMBOL: typeof Symbol.iterator = Symbol.iterator;

// const _objToString = objectProto.toString;
// // deno-lint-ignore no-explicit-any
// function getRawTag(value: any): string {
//   const isOwn = hasOwnProperty(value, TO_STRING_SYMBOL);
//   const tag = value[TO_STRING_SYMBOL];

//   let unmasked: boolean;
//   try {
//     value[TO_STRING_SYMBOL] = undefined;
//     unmasked = true;
//   } catch (_error) {
//     unmasked = false;
//   }

//   const result = _objToString.call(value);
//   if (unmasked) {
//     if (isOwn) {
//       value[TO_STRING_SYMBOL] = tag;
//     } else {
//       delete value[TO_STRING_SYMBOL];
//     }
//   }
//   return result;
// }

/**
 * Converts an string or number to Nib.
 */
export type NibLike = number | string | Nib;
function valToNib(val: string | bigint | number): Nib {
  let str: string;
  switch (typeof val) {
    case "number":
    case "bigint":
      str = val.toString(16);
      break;
    default:
      str = String(val);
  }
  const indexPlusOne: number = NIB_TABLE[str.charCodeAt(0)] | 0;
  if (!indexPlusOne || indexPlusOne > NIBS.length || str.length !== 1) {
    throw new Error(
      `'${val}' isn't a valid nib, must be a hexadecimal digit or number between 0-16`,
    );
  }
  return NIBS[indexPlusOne - 1]!;
}

const NULL_SYMBOL: unique symbol = Symbol("ChildrenIterator.null");
type Children<T> = { [key in Nib]?: T };
type ChildrenIteratorResult<C> = C | typeof NULL_SYMBOL;
type ChildrenIteratorCallback<T> = (nib: Nib) => ChildrenIteratorResult<T>;

export class ChildrenIterator<T> implements globalThis.Iterator<T, undefined> {
  private static readonly NULL: typeof NULL_SYMBOL = NULL_SYMBOL;

  #callback: ChildrenIteratorCallback<T>;
  #cursor: ArrayIterator<Nib>;

  constructor(callback: ChildrenIteratorCallback<T>) {
    // Using NIBS array as iterator, once guarantees nibs are
    // always iterated in the same order, independently of the
    // order in which `children` object was populated.
    this.#cursor = NIBS[ITERATOR_SYMBOL]();
    this.#callback = callback;
  }

  next(): IteratorResult<T, BuiltinIteratorReturn> {
    let next = this.#cursor.next();
    while (!next.done) {
      const child: ChildrenIteratorResult<T> = this.#callback(next.value);
      if (child !== ChildrenIterator.NULL) {
        return { value: child, done: false };
      }
      next = this.#cursor.next();
    }
    return next;
  }

  get [TO_STRING_SYMBOL]() {
    return "ChildrenIterator";
  }

  toString() {
    return "[ChildrenIterator]";
  }

  [ITERATOR_SYMBOL](): ChildrenIterator<T> {
    return this;
  }
}

function createIterator<C, T>(
  children: Children<C>,
  map: (nib: Nib, child: C) => T,
): ChildrenIterator<T> {
  const callback: ChildrenIteratorCallback<T> = (nib: Nib) => {
    if (hasOwnProperty(children, nib)) {
      const child: C = children[nib]!;
      return map(nib, child);
    }
    return NULL_SYMBOL;
  };
  return new ChildrenIterator(callback);
}

type ChildrenMapCallback<C, U> = (
  value: [Nib, C],
  index: number,
  children: TrieChildren<C>,
) => U;

const identityCallback = <C, U>(
  value: [Nib, unknown],
  _index: number,
  _children: TrieChildren<C>,
): U => {
  return value[1] as U;
};

export class TrieChildren<C> {
  #children: { [key in Nib]?: C };
  #size: number;

  constructor() {
    this.#children = {};
    this.#size = 0;
  }

  public set(key: NibLike | Nib, child: C): void {
    const nib = valToNib(key);
    const before = hasOwnProperty(this.#children, nib);
    this.#children[nib] = child;
    const after = hasOwnProperty(this.#children, nib);
    if (before !== after) {
      this.#size++;
    }
  }

  public delete(nib: NibLike): void {
    this.take(nib);
  }

  public has(nib: NibLike): boolean {
    return hasOwnProperty(this.#children, valToNib(nib));
  }

  public take(nib: NibLike): C | undefined {
    nib = valToNib(nib);
    const value = this.#children[nib as Nib];
    const before = hasOwnProperty(this.#children, nib);
    delete this.#children[nib as Nib];
    const after = hasOwnProperty(this.#children, nib);
    if (before !== after) {
      this.#size--;
    }
    return value;
  }

  public get(nib: NibLike): C | undefined {
    return this.#children[valToNib(nib)];
  }

  public get size(): number {
    return this.#size;
  }

  public get entries(): ChildrenIterator<[Nib, C]> {
    return createIterator(this.#children, (nib, child) => [nib, child]);
  }

  public get keys(): ChildrenIterator<Nib> {
    return createIterator(this.#children, (nib) => nib);
  }

  public get values(): ChildrenIterator<C> {
    return createIterator(this.#children, (_, child) => child);
  }

  public reduce(
    callbackfn: (
      previousValue: [Nib, C],
      currentValue: [Nib, C],
      index: number,
      children: TrieChildren<C>,
    ) => [Nib, C],
  ): [Nib, C];
  public reduce<U>(
    callbackfn: (
      previousValue: U,
      currentValue: [Nib, C],
      currentIndex: number,
      children: TrieChildren<C>,
    ) => U,
    initialValue?: U,
  ): U {
    const iter: Iterator<[key: Nib, val: C]> = this[ITERATOR_SYMBOL]();
    let next = iter.next();
    let index = 0;
    if (arguments.length < 2) {
      initialValue = next.value as U;
      if (next.done) return initialValue;
      index++;
    }
    next = iter.next();
    while (!next.done) {
      const value: [Nib, C] = next.value;
      initialValue = callbackfn(initialValue!, value, index++, this);
      index++;
    }
    return initialValue!;
  }

  public forEach(
    callbackfn: (
      value: [Nib, C],
      index: number,
      children: TrieChildren<C>,
    ) => void,
    thisArg?: unknown,
  ): void {
    callbackfn = callbackfn.bind(thisArg);
    let index = 0;
    for (const val of this) {
      callbackfn(val, index++, this);
    }
  }

  public map<U>(
    callbackfn: (
      value: [Nib, C],
      index: number,
      children: TrieChildren<C>,
    ) => U,
    thisArg?: unknown,
  ): TrieChildren<U> {
    callbackfn = callbackfn.bind(thisArg);
    const children: TrieChildren<U> = new TrieChildren();
    for (const value of this) {
      const val = callbackfn(value, children.size, this);
      children.set(value[0], val);
    }
    return children;
  }

  public toObject<U>(
    callbackfn: ChildrenMapCallback<C, U>,
    thisArg?: unknown,
  ): { [key: string]: U };
  public toObject<U = C>(
    callbackfn?: ChildrenMapCallback<C, U>,
    thisArg?: unknown,
  ): { [key: string]: U } {
    callbackfn = callbackfn ? callbackfn.bind(thisArg) : identityCallback;
    const children: { [key: string]: U } = {};
    let index = 0;
    for (const value of this) {
      children[value[0]] = callbackfn(value, index++, this);
    }
    return children;
  }

  *[ITERATOR_SYMBOL](this: TrieChildren<C>): Iterator<[key: Nib, val: C]> {
    for (const nib of NIBS) {
      if (hasOwnProperty(this.#children, nib)) {
        const child = this.#children[nib]!;
        yield [nib, child];
      }
    }
  }
}
