// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

use crate::{abort, host::HostFnImpl, trie::TrieNode};
use alloc::vec::Vec;
use js_sys::JsString;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(raw_module = "../src/lib.exports.ts")]
extern "C" {
    pub type JSMerklePatriciaTrie;

    pub type JSTrieBuilder;

    #[wasm_bindgen(constructor)]
    pub fn new() -> JSTrieBuilder;

    #[wasm_bindgen(method, getter)]
    pub fn id(this: &JSTrieBuilder) -> Option<js_sys::JsString>;

    #[wasm_bindgen(method, setter)]
    pub fn set_id(this: &JSTrieBuilder, id: Option<js_sys::JsString>);

    #[wasm_bindgen(method, getter)]
    pub fn nibbles(this: &JSTrieBuilder) -> Option<js_sys::JsString>;

    #[wasm_bindgen(method, setter)]
    pub fn set_nibbles(this: &JSTrieBuilder, nibbles: Option<js_sys::JsString>);

    #[wasm_bindgen(method, getter)]
    pub fn value(this: &JSTrieBuilder) -> Option<js_sys::JsString>;

    #[wasm_bindgen(method, setter)]
    pub fn set_value(this: &JSTrieBuilder, value: Option<js_sys::JsString>);

    #[wasm_bindgen(method, getter)]
    pub fn raw_bytes(this: &JSTrieBuilder) -> Option<js_sys::JsString>;

    #[wasm_bindgen(method, setter)]
    pub fn set_raw_bytes(this: &JSTrieBuilder, bytes: Option<js_sys::JsString>);

    #[wasm_bindgen(method)]
    pub fn push_child(this: &JSTrieBuilder, nibble: u8, child: &JSTrieBuilder);

    #[wasm_bindgen(method)]
    pub fn build(this: &JSTrieBuilder) -> JSMerklePatriciaTrie;
}

fn bytes2js_string<I: core::iter::Iterator<Item = u8>>(
    buffer: &mut Vec<u16>,
    bytes: I,
) -> js_sys::JsString {
    unsafe {
        buffer.set_len(0);
    }
    buffer.push(b'0' as u16);
    buffer.push(b'x' as u16);

    for byte in bytes {
        buffer.push(ALPHABET[(byte >> 4) as usize] as u16);
        buffer.push(ALPHABET[(byte & 15) as usize] as u16);
    }
    JsString::from_char_code(buffer)
}

const ALPHABET: &[u8; 16] = b"0123456789ABCDEF";
impl JSTrieBuilder {
    fn from_trie(
        node: &TrieNode,
        nodes: &[TrieNode],
        parent_nibble: Option<u8>,
        buffer: &mut Vec<u16>,
    ) -> Self {
        let root = JSTrieBuilder::new();
        if let Some(slice) = node.nibbles.as_ref() {
            if !slice.is_empty() || parent_nibble.is_some() {
                unsafe {
                    buffer.set_len(0);
                }
                buffer.push(b'0' as u16);
                buffer.push(b'x' as u16);
                if let Some(parent_nibble) = parent_nibble {
                    buffer.push(ALPHABET[(parent_nibble & 15) as usize] as u16);
                }
                for nibble in slice.iter() {
                    buffer.push(ALPHABET[(nibble & 15) as usize] as u16);
                }
                let bytes = JsString::from_char_code(buffer);
                root.set_nibbles(Some(bytes));
            }
        }
        let has_raw_bytes = node.raw_bytes.is_some();
        if let Some(id) = node.id.as_ref() {
            let id_bytes = &id.0;
            let id_str = bytes2js_string(buffer, id_bytes.iter().copied());
            root.set_id(Some(id_str));
            if !has_raw_bytes {
                unsafe {
                    buffer.set_len(0);
                    let len = buffer.capacity() * 2;
                    let mut output = core::slice::from_raw_parts_mut(buffer.as_mut_ptr() as *mut u8, len);
                    if HostFnImpl::get_storage(id_bytes, &mut output).is_none() {
                        let offset = (output.len() + 2) >> 1;
                        buffer.set_len(offset);
                        buffer.push(b'0' as u16);
                        buffer.push(b'x' as u16);

                        for byte in output {
                            let byte = *byte;
                            buffer.push(ALPHABET[(byte >> 4) as usize] as u16);
                            buffer.push(ALPHABET[(byte & 15) as usize] as u16);
                        }
                        let raw_bytes = JsString::from_char_code(&buffer[offset..]);
                        root.set_raw_bytes(Some(raw_bytes));
                    }
                }
            }
        }
        if let Some(value) = node.value.as_ref() {
            let value = bytes2js_string(buffer, value.iter().copied());
            root.set_value(Some(value));
        }
        if let Some(raw_bytes) = node.raw_bytes {
            let raw_bytes = bytes2js_string(buffer, raw_bytes.iter().copied());
            root.set_raw_bytes(Some(raw_bytes));
        }
        for (index, nibble) in node.children.iter() {
            let Some(child) = nodes.get(index) else {
                abort!("child at index {} not found", index);
            };
            // let child = JSTrieBuilder::from_trie(child, nodes, Some(nibble), buffer);
            let child = JSTrieBuilder::from_trie(child, nodes, None, buffer);
            root.push_child(nibble, &child);
        }
        root
    }
}

impl JSMerklePatriciaTrie {
    pub fn new(node: &TrieNode, nodes: &[TrieNode]) -> Self {
        let mut buffer = Vec::<u16>::with_capacity(16384);
        let builder = JSTrieBuilder::from_trie(node, nodes, None, &mut buffer);
        builder.build()
    }
}
