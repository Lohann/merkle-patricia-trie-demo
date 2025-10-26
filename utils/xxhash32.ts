// MIT License
//
// Copyright (c) 2024 cgiosy
//
// Copied from https://github.com/cgiosy/xxh32/blob/main/src/raw.ts
// The `getUint32` was replaced by a DataView object, which is more
// suitable for arbitrary ArrayBufferLike inputs (Uint32List, Uint16List, etc..)
//
// It also adds an specialized `xxh32num` method, which hashes a
// single 32bit integer, or 64bit float value.

// deno-fmt-ignore-file
// deno-lint-ignore-file
// eslint-disable"
const _BUFFER = new ArrayBuffer(128);
const _DATAVIEW = new DataView(_BUFFER);

const rotl32 = (x: number, r: number) => (x << r) | (x >>> 32 - r);

export const xxh32raw = (dataView: DataView, seed = 0) => {
	seed |= 0;
	const len = dataView.byteLength;
	let i = 0;
	let h = (seed + len | 0) + 0x165667B1 | 0;
	if (len < 16) {
        for (; (i + 3 | 0) < len; i = i + 4 | 0) 
            h = Math.imul(rotl32(h + Math.imul(dataView.getUint32(i, true), 0xC2B2AE3D) | 0, 17), 0x27D4EB2F);
	} else {
		let v0 = seed + 0x24234428 | 0;
		let v1 = seed + 0x85EBCA77 | 0;
		let v2 = seed;
		let v3 = seed - 0x9E3779B1 | 0;

		for (; (i + 15 | 0) < len; i = i + 16 | 0) {
			v0 = Math.imul(rotl32(v0 + Math.imul(dataView.getUint32(i + 0 | 0, true), 0x85EBCA77) | 0, 13), 0x9E3779B1);
			v1 = Math.imul(rotl32(v1 + Math.imul(dataView.getUint32(i + 4 | 0, true), 0x85EBCA77) | 0, 13), 0x9E3779B1);
			v2 = Math.imul(rotl32(v2 + Math.imul(dataView.getUint32(i + 8 | 0, true), 0x85EBCA77) | 0, 13), 0x9E3779B1);
			v3 = Math.imul(rotl32(v3 + Math.imul(dataView.getUint32(i + 12 | 0, true), 0x85EBCA77) | 0, 13), 0x9E3779B1);
		}

		h = (((rotl32(v0, 1) + rotl32(v1, 7) | 0) + rotl32(v2, 12) | 0) + rotl32(v3, 18) | 0) + len | 0;
		for (; (i + 3 | 0) < len; i = i + 4 | 0)
			h = Math.imul(rotl32(h + Math.imul(dataView.getUint32(i, true), 0xC2B2AE3D) | 0, 17), 0x27D4EB2F);
	}

    for (; i < len; i = i + 1 | 0) {
        h = Math.imul(rotl32(h + Math.imul(dataView.getUint8(i), 0x165667B1) | 0, 11), 0x9E3779B1);
    }

	h = Math.imul(h ^ h >>> 15, 0x85EBCA77);
	h = Math.imul(h ^ h >>> 13, 0xC2B2AE3D);
	return (h ^ h >>> 16) >>> 0;
};

export const xxh32num = (num: number, seed: number, len?: number) => {
  seed |= 0;
  if (Number.isSafeInteger(num)) {
    _DATAVIEW.setBigInt64(0, BigInt(num), true);
    len ??= num > 0xffffffff ? 8 : 4;
  } else {
    _DATAVIEW.setFloat64(0, num, true);
    len ??= 8;
  }
  let h = (seed + len | 0) + 0x165667B1 | 0;
  h = Math.imul(
    rotl32(h + Math.imul(_DATAVIEW.getUint32(0, true), 0xC2B2AE3D) | 0, 17),
    0x27D4EB2F,
  );
  if (len > 4) {
    h = Math.imul(
      rotl32(h + Math.imul(_DATAVIEW.getUint32(4, true), 0xC2B2AE3D) | 0, 17),
      0x27D4EB2F,
    );
  }
  h = Math.imul(h ^ h >>> 15, 0x85EBCA77);
  h = Math.imul(h ^ h >>> 13, 0xC2B2AE3D);
  return (h ^ h >>> 16) >>> 0;
};
