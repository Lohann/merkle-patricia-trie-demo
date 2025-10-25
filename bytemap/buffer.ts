// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/*
 * Detect System Endianess.
 */
const NATIVE_LITTLE_ENDIAN: boolean | undefined = (function () {
  const uint8 = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
  const uint32 = (new Uint32Array(uint8.buffer, 0, 1))[0];
  switch (uint32) {
    case 0x44332211:
      return true;
    case 0x11223344:
      return false;
    default:
      return undefined;
  }
})();

function assertInteger(n: number, min?: number, max?: number): void {
  min = min ?? Number.MIN_SAFE_INTEGER;
  max = max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(n)) {
    throw new Error(`not a integer: ${n}`);
  }
  if (n < min) {
    throw new Error(`out of bounds: ${n} < ${min}`);
  }
  if (n > max) {
    throw new Error(`out of bounds: ${n} > ${max}`);
  }
}

function assertBigInt(n: bigint, min?: bigint, max?: bigint): void {
  if (min && n < min) {
    throw new Error(`out of bounds: ${n} < ${min}`);
  }
  if (max && n > max) {
    throw new Error(`out of bounds: ${n} > ${max}`);
  }
}

/*
 * Computes the next power of 2.
 */
function nextPowerOf2(val: number): number {
  assertInteger(val, 0);
  // val <<= val > (((~val)+1) & val) ? 1 : 0;
  val |= 1;
  val |= val >> 1;
  val |= val >> 2;
  val |= val >> 4;
  val |= val >> 8;
  val |= val >> 16;
  val |= val >> 32;
  return val + 1;
}

/*
 * Grow or alloc a new ArrayBuffer depending on maxByteLength.
 */
function growOrAlloc(
  newCapacity: number,
  maxByteLength: number,
  buffer: ArrayBuffer,
): ArrayBuffer | undefined {
  if (newCapacity > maxByteLength) {
    throw new Error(
      `capacity > maxByteLength: ${newCapacity} > ${maxByteLength}`,
    );
  }
  if (newCapacity <= buffer.byteLength) return undefined;
  const capacity = buffer.resizable ? buffer.byteLength : buffer.maxByteLength;

  if (newCapacity <= capacity) {
    // Grow
    buffer.resize(newCapacity);
    buffer.resizable;
    return undefined;
  }

  // alloc a new ArrayBuffer.
  return new ArrayBuffer(newCapacity, { maxByteLength });
}

interface TypedArray<T> {
  set: (array: ArrayLike<T>, offset?: number) => void;
}

interface TypedArrayConstructor<T> {
  BYTES_PER_ELEMENT: number;
  new (buffer: ArrayBuffer, offset: number, length: number): TypedArray<T>;
}

function isNativeEndianess(littleEndian?: boolean): boolean {
  return littleEndian === undefined || littleEndian === NATIVE_LITTLE_ENDIAN;
}

export type GrowCallback = (
  requiredCapacity: number,
  capacity: number,
) => number;

export const defaultGrowCallback: GrowCallback = (
  requiredCapacity: number,
  capacity: number,
): number => {
  if (requiredCapacity <= capacity) {
    return Math.min(nextPowerOf2(requiredCapacity), capacity);
  }
  return Math.max(requiredCapacity, capacity * 2);
};

export interface BufferOptions {
  capacity?: number;
  growCallback?: GrowCallback;
}

export class ByteBuffer {
  #buffer: ArrayBuffer;
  #view: DataView;
  #byteView: Uint8Array;
  #size: number;
  #ptr: number;
  #grow: GrowCallback;

  public static DEFAULT_CAPACITY: number = 512;

  constructor(options?: BufferOptions) {
    let capacity: number = ByteBuffer.DEFAULT_CAPACITY;
    let growCallback = defaultGrowCallback;
    if (options && (options.capacity || options.capacity)) {
      capacity = options.capacity ?? capacity;
      growCallback = options.growCallback ?? growCallback;
    }
    assertInteger(capacity, 0);
    this.#grow = growCallback;

    const buffer = new ArrayBuffer(capacity, { maxByteLength: capacity });
    this.#buffer = buffer;
    this.#size = 0;
    this.#ptr = 0;
    this.#view = new DataView(
      this.#buffer,
      0,
      this.#buffer.byteLength,
    );
    this.#byteView = new Uint8Array(buffer);
  }

  private _writeArray<T extends number | bigint>(
    input: ArrayLike<T>,
    arrayConstructor: TypedArrayConstructor<T>,
    setValue: (
      this: DataView,
      offset: number,
      value: T,
      littleEndian?: boolean,
    ) => void,
    littleEndian?: boolean,
  ): void {
    const len = input.length;
    if (len === 0) return;
    const size = arrayConstructor.BYTES_PER_ELEMENT;
    let offset = this.reserveBytes(len * size);

    if (isNativeEndianess(littleEndian)) {
      const array = new arrayConstructor(this.#buffer, offset, len);
      array.set(input);
    } else {
      const dataView = this.#view;
      for (let i = 0; i < len; i++) {
        setValue.call(dataView, offset, input[i], littleEndian);
        offset += size;
      }
    }
  }

  private _grow(size: number) {
    const max = this.#buffer.byteLength;
    if (size <= max) return;

    let maxByteLength: number = this.capacity;
    const newCapacity = this.#grow(size, maxByteLength);
    if (newCapacity > maxByteLength) {
      maxByteLength = this.#grow(newCapacity, newCapacity);
    }
    if (newCapacity < size) {
      throw new Error("out of bounds: cannot grow array.");
    }
    if (maxByteLength < newCapacity) {
      throw new Error("out of bounds: maxByteLength < capacity");
    }
    let buffer: ArrayBuffer | undefined = growOrAlloc(
      newCapacity,
      maxByteLength,
      this.#buffer,
    );
    if (buffer) {
      const detached = new Uint8Array(this.#buffer.transfer(), 0, this.#size);
      (new Uint8Array(buffer)).set(detached, 0);
      this.#buffer = buffer;
    } else {
      buffer = this.#buffer;
    }
    this.#view = new DataView(buffer, 0, buffer.byteLength);
    this.#byteView = new Uint8Array(buffer, 0, buffer.byteLength);
  }

  private reserveBytes(count: number): number {
    const offset = this.#ptr;
    const end = offset + count;
    this._grow(end);
    this.#ptr = end;
    this.#size = Math.max(this.#size, end);
    return offset;
  }

  public copyBytes(output: Uint8Array, offset?: number): void {
    offset ??= 0;
    const end = offset + output.length;
    assertInteger(end, 0, this.#size);
    output.set(this.#byteView.subarray(offset, end));
  }

  public slice(begin?: number, end?: number): Uint8Array {
    begin ??= 0;
    end ??= this.#ptr;
    assertInteger(end, begin, this.#size);
    return this.#byteView.slice(begin, end);
  }

  public writeU8(val: number): ByteBuffer {
    assertInteger(val, 0, 0xff);
    const offset = this.reserveBytes(1);
    this.#byteView[offset] = val;
    return this;
  }

  public writeU8List(bytes: ArrayLike<number>): ByteBuffer {
    const offset = this.reserveBytes(bytes.length);
    this.#byteView.set(bytes, offset);
    return this;
  }

  public readU8(offset: number): number {
    assertInteger(offset, 0, this.#size - 1);
    return this.#byteView[offset];
  }

  public writeI8(val: number): ByteBuffer {
    assertInteger(val, -0x80, 0x7f);
    const offset = this.reserveBytes(1);
    this.#view.setInt8(offset, val);
    return this;
  }

  public writeI8List(array: ArrayLike<number>): ByteBuffer {
    if (array.length === 0) return this;
    const offset = this.reserveBytes(array.length);
    const buffer = new Int8Array(this.#buffer, offset, array.length);
    buffer.set(array);
    return this;
  }

  public readI8(offset: number): number {
    assertInteger(offset, 0, this.#size - 1);
    return this.#view.getInt8(offset);
  }

  public writeI16(val: number, littleEndian?: boolean): ByteBuffer {
    assertInteger(val, -0x8000, 0x7fff);
    const offset = this.reserveBytes(2);
    this.#view.setInt16(offset, val, littleEndian);
    return this;
  }

  public writeI16List(
    array: ArrayLike<number>,
    littleEndian?: boolean,
  ): ByteBuffer {
    this._writeArray(
      array,
      Int16Array,
      DataView.prototype.setInt16,
      littleEndian,
    );
    return this;
  }

  public readI16(offset: number, littleEndian?: boolean): number {
    assertInteger(offset, 0, this.#size - 2);
    return this.#view.getInt16(offset, littleEndian);
  }

  public writeU16(val: number, littleEndian?: boolean): ByteBuffer {
    assertInteger(val, 0, 0xffff);
    const offset = this.reserveBytes(2);
    this.#view.setUint16(offset, val, littleEndian);
    return this;
  }

  public writeU16List(
    array: ArrayLike<number>,
    littleEndian?: boolean,
  ): ByteBuffer {
    this._writeArray(
      array,
      Uint16Array,
      DataView.prototype.setUint16,
      littleEndian,
    );
    return this;
  }

  public readU16(offset: number, littleEndian?: boolean): number {
    assertInteger(offset, 0, this.#size - 2);
    return this.#view.getUint16(offset, littleEndian);
  }

  public writeI32(val: number, littleEndian?: boolean): ByteBuffer {
    assertInteger(val, -0x80000000, 0x7fffffff);
    const offset = this.reserveBytes(4);
    this.#view.setInt32(offset, val, littleEndian);
    return this;
  }

  public writeI32List(
    array: ArrayLike<number>,
    littleEndian?: boolean,
  ): ByteBuffer {
    this._writeArray(
      array,
      Int32Array,
      DataView.prototype.setInt32,
      littleEndian,
    );
    return this;
  }

  public readI32(offset: number, littleEndian?: boolean): number {
    assertInteger(offset, 0, this.#size - 3);
    return this.#view.getInt32(offset, littleEndian);
  }

  public writeU32(val: number, littleEndian?: boolean): ByteBuffer {
    assertInteger(val, 0, 0xffffffff);
    const offset = this.reserveBytes(4);
    this.#view.setUint32(offset, val, littleEndian);
    return this;
  }

  public writeU32List(
    array: ArrayLike<number>,
    littleEndian?: boolean,
  ): ByteBuffer {
    this._writeArray(
      array,
      Uint32Array,
      DataView.prototype.setUint32,
      littleEndian,
    );
    return this;
  }

  public readU32(offset: number, littleEndian?: boolean): number {
    littleEndian ??= NATIVE_LITTLE_ENDIAN;
    assertInteger(offset, 0, this.#size - 7);
    return this.#view.getUint32(offset, littleEndian);
  }

  public writeI64(val: bigint, littleEndian?: boolean): ByteBuffer {
    littleEndian ??= NATIVE_LITTLE_ENDIAN;
    assertBigInt(val, -0x8000000000000000n, 0x7fffffffffffffffn);
    const offset = this.reserveBytes(8);
    this.#view.setBigInt64(offset, val, littleEndian);
    return this;
  }

  public writeI64List(
    array: ArrayLike<bigint>,
    littleEndian?: boolean,
  ): ByteBuffer {
    this._writeArray(
      array,
      BigInt64Array,
      DataView.prototype.setBigInt64,
      littleEndian,
    );
    return this;
  }

  public readI64(offset: number, littleEndian?: boolean): bigint {
    littleEndian ??= NATIVE_LITTLE_ENDIAN;
    assertInteger(offset, 0, this.#size - 7);
    return this.#view.getBigInt64(offset, littleEndian);
  }

  public writeU64(val: bigint, littleEndian?: boolean): ByteBuffer {
    littleEndian ??= NATIVE_LITTLE_ENDIAN;
    assertBigInt(val, 0n, 0xffffffffffffffffn);
    const offset = this.reserveBytes(8);
    this.#view.setBigUint64(offset, val, littleEndian);
    return this;
  }

  public writeU64List(
    array: ArrayLike<bigint>,
    littleEndian?: boolean,
  ): ByteBuffer {
    this._writeArray(
      array,
      BigUint64Array,
      DataView.prototype.setBigUint64,
      littleEndian,
    );
    return this;
  }

  public readU64(offset: number, littleEndian?: boolean): bigint {
    littleEndian ??= NATIVE_LITTLE_ENDIAN;
    assertInteger(offset, 0, this.#size - 7);
    return this.#view.getBigUint64(offset, littleEndian);
  }

  public writeF64(val: number, littleEndian?: boolean): ByteBuffer {
    littleEndian ??= NATIVE_LITTLE_ENDIAN;
    const offset = this.reserveBytes(8);
    this.#view.setFloat64(offset, val, littleEndian);
    return this;
  }

  public readF64(offset: number, littleEndian?: boolean): number {
    littleEndian ??= NATIVE_LITTLE_ENDIAN;
    assertInteger(offset, 0, this.#size - 7);
    return this.#view.getFloat64(offset, littleEndian);
  }

  public shrink(size?: number): void {
    size ??= this.#ptr;
    const capacity = this.capacity;
    if (size < capacity) {
      const buffer = this.#buffer.transferToFixedLength(size);
      this.#view = new DataView(buffer);
      this.#byteView = new Uint8Array(buffer);
    }
  }

  public transfer(newByteLength?: number): ArrayBuffer {
    if (this.#buffer.detached || this.#buffer.maxByteLength === 0) {
      throw new Error("buffer already taken");
    }
    const buffer = this.#buffer.transfer(newByteLength);
    this.#size = 0;
    this.#buffer = new ArrayBuffer(0, { maxByteLength: 0 });
    this.#view = new DataView(this.#buffer, 0, 0);
    this.#byteView = new Uint8Array(this.#buffer, 0, 0);
    return buffer;
  }

  public subarray(begin: number, end?: number): Uint8Array {
    end ??= this.#ptr;
    assertInteger(end, begin, this.#ptr);
    return this.#byteView.subarray(begin, end);
  }

  public alloc(size: number, align = 1): Uint8Array {
    size >>>= 0;
    align >>>= 0;
    const begin = (this.#ptr + align - 1 | 0) & (~(align - 1 | 0) | 0);
    const end = begin + size;
    this._grow(end);
    return this.#byteView.subarray(begin, end);
  }

  public get cursor(): number {
    return this.#ptr;
  }

  public set cursor(pos: number) {
    this._grow(pos);
    this.#ptr = pos;
    this.#size = Math.max(this.#size, pos);
  }

  public get available(): number {
    return this.capacity - this.#size;
  }

  public get length(): number {
    return this.#size;
  }

  public get capacity(): number {
    if (this.#buffer.resizable) {
      return this.#buffer.maxByteLength;
    }
    return this.#buffer.byteLength;
  }
}
