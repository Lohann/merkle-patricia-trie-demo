// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const MAX_VALUE = 2147483647;

export class Slab {
  private next: number;
  private len: number;
  private size: number;
  private slots: Int32Array;
  constructor() {
    this.next = 0;
    this.len = 0;
    this.size = 0;
    this.slots = new Int32Array(8);
    this.slots.fill(-1);
  }

  private grow() {
    const slots = new Int32Array(this.slots.length * 2);
    slots.set(this.slots);
    this.slots = slots;
  }

  private insertAt(index: number, val: number): void {
    if (!Number.isInteger(val) || val > MAX_VALUE || val < 0) {
      throw new Error(
        `slab can only store non negative integers up to ${MAX_VALUE}, provided ${val}`,
      );
    }
    if (this.len >= this.slots.length) {
      this.grow();
    }
    const slots = this.slots;
    this.len++;
    if (index === this.size) {
      slots[index] = val;
      this.next = index + 1;
      this.size++;
    } else {
      slots[index] ^= -1;
      this.next = slots[index];
      slots[index] = val;
    }
  }

  public get(index: number): number | undefined {
    if (index < 0 || index >= this.size) {
      return undefined;
    }
    const value = this.slots[index];
    return value < 0 ? undefined : value;
  }

  public insert(val?: number): number {
    const index = this.next;
    val ??= index;
    this.insertAt(index, val);
    return index;
  }

  public remove(index: number): number | undefined {
    const removedValue = this.get(index);
    if (removedValue !== undefined) {
      this.slots[index] = this.next;
      this.slots[index] ^= -1;
      this.next = index;
      this.len--;
    }
    return removedValue;
  }

  public get length(): number {
    return this.len;
  }
}
