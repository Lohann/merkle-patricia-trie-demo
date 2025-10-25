// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// deno-lint-ignore no-explicit-any
const GLOBAL_THIS: { [key: PropertyKey]: any } =
  (function (this: unknown): any {
    "use strict";
    // deno-lint-ignore no-explicit-any
    const check = function (it: any): boolean {
      return it && it.Math === Math && it;
    };

    // https://github.com/zloirock/core-js/issues/86#issuecomment-115759028
    const _globalThis =
      // eslint-disable-next-line es/no-global-this -- safe
      check(typeof globalThis == "object" && globalThis) ||
      check(typeof window == "object" && window) ||
      // eslint-disable-next-line no-restricted-globals -- safe
      check(typeof self == "object" && self) ||
      check(typeof global == "object" && global) ||
      check(typeof this == "object" && this) ||
      // eslint-disable-next-line no-new-func -- fallback
      (function (this: unknown) {
        return this;
      })() || Function("return this")();
    // _globalThis.globalThis = _globalThis;
    return _globalThis;
  })();

const _Object = GLOBAL_THIS.Object as typeof Object;
const _Function = GLOBAL_THIS.Function as typeof Function;
const _Array = GLOBAL_THIS.Array as typeof Array;
const _Number = GLOBAL_THIS.Number as typeof Number;
const _String = GLOBAL_THIS.String as typeof String;
const _BigInt = GLOBAL_THIS.BigInt as typeof BigInt;
const _JSON = GLOBAL_THIS.JSON as typeof JSON;
const _Math = GLOBAL_THIS.Math as typeof Math;
const _Reflect = GLOBAL_THIS.Reflect as typeof Reflect;
const _parseFloat = GLOBAL_THIS.parseFloat as typeof parseFloat;
const _parseInt = GLOBAL_THIS.parseInt as typeof parseInt;
const _ObjectProto = _Object.prototype;
const _toString = _ObjectProto.toString;
const _hasOwnProperty = _ObjectProto.hasOwnProperty;
const _getOwnPropertyDescriptor = _Object.getOwnPropertyDescriptor;
const _is = _Object.is;
const _isNaN = Number.isNaN;

function isPrimitive<T>(value: T): boolean {
  return value !== Object(value);
}

const PARAMS = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
];
function noopFunction(fn: Function): Function {
  const name = fn.name;
  const params = PARAMS.slice(0, Math.min(fn.length || 0, PARAMS.length)).join(
    ",",
  );
  const body =
    `return function ${name}(${params}) { throw new Error("${name} is not allowed"); };`;
  return (new Function(body))();
}

const PROTECTED_GLOBALS: { [key: string]: any } = {
  "Object": _Object,
  "ArrayBuffer": ArrayBuffer,
  "Uint8Array": Uint8Array,
  "Int8Array": Int8Array,
  "Uint16Array": Uint16Array,
  "Int16Array": Int16Array,
  "Uint32Array": Uint32Array,
  "Int32Array": Int32Array,
  "BigUint64Array": BigUint64Array,
  "BigInt64Array": BigInt64Array,
  "atob": atob,
  "btoa": btoa,
  "DataView": DataView,
  "TextEncoder": TextEncoder,
  "TextDecoder": TextDecoder,
  "Function": Function,
  "Array": _Array,
  "Number": _Number,
  "parseFloat": _parseFloat,
  "parseInt": _parseInt,
  "Infinity": Infinity,
  "NaN": NaN,
  "undefined": undefined,
  "Boolean": Boolean,
  "String": _String,
  "Symbol": Symbol,
  "Date": Date,
  "Promise": undefined,
  "RegExp": undefined,
  "Error": Error,
  "Math": _Math,
  "JSON": _JSON,
  "BigInt": _BigInt,
  "console": Object.freeze({
    log: Object.freeze((...args: any[]) => console.log.apply(null, args)),
    error: Object.freeze((...args: any[]) => console.error.apply(null, args)),
  }),
  "fetch": noopFunction(fetch),
  "eval": noopFunction(eval),
};
Object.keys(PROTECTED_GLOBALS).forEach((local: string) => {
  // deno-lint-ignore no-explicit-any
  const value = local in globalThis && (globalThis as any)[local];
  if (value && typeof value === "function") {
    PROTECTED_GLOBALS;
  }
});

const SAFE_CONTEXT: { [key: string | symbol]: PropertyDescriptor } = {
  "Infinity": {
    value: Infinity,
    enumerable: false,
    writable: false,
    configurable: false,
  },
  "NaN": {
    value: NaN,
    enumerable: false,
    writable: false,
    configurable: false,
  },
  "undefined": {
    value: undefined,
    enumerable: false,
    writable: false,
    configurable: false,
  },
};

(function (): void {
  function defineSafeContextProp(prop: string | symbol) {
    if (_hasOwnProperty.call(SAFE_CONTEXT, prop)) return;
    const propertyDescriptor: PropertyDescriptor = {
      value: undefined,
      writable: true,
      enumerable: false,
      configurable: true,
    };
    if (
      typeof prop === "string" && _hasOwnProperty.call(PROTECTED_GLOBALS, prop)
    ) {
      const value = PROTECTED_GLOBALS[prop];
      delete propertyDescriptor.value;
      delete propertyDescriptor.writable;
      propertyDescriptor.enumerable = true;
      propertyDescriptor.configurable = false;
      propertyDescriptor.get = () => value;
      propertyDescriptor.set = () => {
        throw new Error(`modify ${prop} is not allowed`);
      };
    }
    SAFE_CONTEXT[prop] = propertyDescriptor;
  }
  let keys: (string | symbol)[];
  try {
    keys = _Reflect.ownKeys(globalThis);
  } catch (_err) {
    keys = _Object.keys(globalThis);
  }
  for (const key of keys) {
    try {
      defineSafeContextProp(key);
    } catch (_err) {
      continue;
    }
  }
})();

type SandboxLocals = { [key: string]: unknown };
type SandboxContext = { [key: string]: object | undefined };

function pushSandboxLocal(
  that: { [key: PropertyKey]: unknown },
  prop: PropertyKey,
  descriptor: PropertyDescriptor,
  builder: string[],
): void {
  const value = descriptor.get ? descriptor.get() : descriptor.value;
  if (_hasOwnProperty.call(that, prop)) {
    if (_Object.is(value, that[prop])) return;
    throw new Error("Duplicated property");
  }
  _Object.defineProperty(that, prop, descriptor);
  const isGlobal = _hasOwnProperty.call(GLOBAL_THIS, prop);
  if (isGlobal && _Object.is(value, GLOBAL_THIS[prop])) return;
  if (typeof prop !== "string") return;

  if (isPrimitive(value)) {
    const valueStr = String(value);
    if (prop === valueStr) return;
    builder.push(`\tvar ${prop} = ${String(value)};`);
  } else {
    builder.push(`\tvar ${prop} = this[${JSON.stringify(prop)}];`);
  }
}

export function createSandbox<T extends object>(
  code: string,
  locals?: SandboxLocals,
): (() => void) | undefined {
  // Define global
  const that: { [key: PropertyKey]: any } = Object.create(null);
  _Object.defineProperty(that, "globalThis", {
    value: that,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  const codeBuilder = ["\tvar globalThis = this;"];

  // Set Locals
  if (locals) {
    for (const [param, value] of Object.entries(locals)) {
      const descriptor: PropertyDescriptor = {
        value: value,
        configurable: true,
        enumerable: true,
        writable: true,
      };
      pushSandboxLocal(that, param, descriptor, codeBuilder);
    }
  }

  // Set Defaults
  _Object.entries(SAFE_CONTEXT).forEach(([prop, descriptor]) => {
    if (_hasOwnProperty.call(that, prop)) return;
    pushSandboxLocal(that, prop, { ...descriptor }, codeBuilder);
  });

  // Prepare code
  try {
    // Validate code
    new Function(code);
    code = code.replaceAll("\n", "\n\t\t");
    code =
      `\treturn void function(){\n\t\t${code}\n\t}\n\t.apply(globalThis,[]);`;
  } catch (error) {
    console.error(error);
    return undefined;
  }
  codeBuilder.push(code);
  code = codeBuilder.join("\n");

  // create the parameter list for the sandbox
  const context = Array.prototype.concat.call(that, code) as [
    thisArg: T,
    ...argArray: (object | undefined)[],
  ];

  // create the sandbox function
  const Sandbox: FunctionConstructor = Function.prototype.bind.apply(
    Function,
    context,
  );

  // deno-lint-ignore ban-types
  let sandbox: Function;
  try {
    sandbox = new Sandbox();
  } catch (error) {
    console.error(error);
    return undefined;
  }
  // bind the local variables to the sandbox
  const callback = Function.prototype.bind.apply(sandbox, [that]);
  return callback;
}

// // const that = Object.create(null); // create our own this object for the user code
// const code = 'console.log("HAHA Hello World", Object.keys(globalThis), trie.insert("0xAABBCCDD", "0xBBCCDDEE"));'; // get the user code
// const sandbox = createSandbox(code, Object.entries({
//     trie: {
//         insert: () => {
//             return "VALUE INSERTED!";
//         }
//     },
// }))!; // create a sandbox
// console.log('-------------------------------------------------------------');
// console.log('sandbox code:', sandbox.toString());
// console.log('-------------------------------------------------------------');
// sandbox(); // call the user code in the sandbox
// console.log('-------------------------------------------------------------');
// // console.log(getTag(globalThis));
// // Object.prototype.toString.call(globalThis);
