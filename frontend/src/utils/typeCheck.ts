// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
// deno-lint-ignore no-explicit-any
function getRawTag(value: any) {
  const isOwn = Object.prototype.hasOwnProperty.call(value, Symbol.toStringTag);
  const tag = value[Symbol.toStringTag];

  let unmasked = undefined;
  try {
    value[Symbol.toStringTag] = undefined;
    unmasked = true;
    // deno-lint-ignore no-empty
  } catch (_error) {}

  const result = Object.prototype.toString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[Symbol.toStringTag] = tag;
    } else {
      delete value[Symbol.toStringTag];
    }
  }
  return result;
}

export const TAG: { readonly [key: string]: string } = Object.freeze({
  undefined: "[object Undefined]",
  null: "[object Null]",
  number: "[object Number]",
  object: "[object Object]",
  string: "[object String]",
  function: "[object Function]",
  asyncFunction: "[object AsyncFunction]",
  generatorFunction: "[object GeneratorFunction]",
  proxy: "[object Proxy]",
});

export function baseGetTag(value: unknown) {
  if (value == null) {
    return value === undefined ? TAG.undefined : TAG.null;
  }
  return (Symbol.toStringTag in Object(value))
    ? getRawTag(value)
    : Object.prototype.toString.call(value);
}

export function isObjectLike(value: unknown): boolean {
  return value != null && typeof value == "object";
}

export function isNumber(value: unknown): boolean {
  return typeof value == "number" ||
    (isObjectLike(value) && baseGetTag(value) == TAG.number);
}

export function isObject(value: unknown): boolean {
  const type = typeof value;
  return value != null && (type == "object" || type == "function");
}

export function isFunction(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 9 which returns 'object' for typed arrays and other constructors.
  const tag = baseGetTag(value);
  return tag == TAG.function || tag == "[object GeneratorFunction]" ||
    tag == "[object AsyncFunction]" || tag == "[object Proxy]";
}

export function isLength(value: unknown): boolean {
  return typeof value == "number" && value > -1 && value % 1 == 0 &&
    value <= Number.MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 * @param value
 * @returns
 */
export function isArrayLike(value: unknown): boolean {
  return value != null &&
    isLength((value as ArrayLike<unknown>).length) &&
    !isFunction(value);
}

export function isPlainObject(value: unknown): boolean {
  if (!isObjectLike(value) || baseGetTag(value) != TAG.object) {
    return false;
  }
  const proto = Object.getPrototypeOf(Object(value));
  if (proto === null) {
    return true;
  }
  const Ctor = Object.hasOwnProperty.call(proto, "constructor") &&
    proto.constructor;
  return typeof Ctor == "function" && Ctor instanceof Ctor &&
    Function.prototype.toString.call(Ctor) ==
      Function.prototype.toString.call(Object);
}

export function isPrimitive<T>(value: T): boolean {
  return value !== Object(value);
}
