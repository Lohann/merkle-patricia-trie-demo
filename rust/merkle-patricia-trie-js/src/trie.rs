// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

use crate::{abort, children::Children, storage::Layout, trie_builder::JSMerklePatriciaTrie};
use hash_db::{HashDB, EMPTY_PREFIX};
use sp_core::{bounded::alloc::vec::Vec, Blake2Hasher, H256};
use sp_trie::{NodeCodec, NodePlan, ValuePlan};
use trie_db::{
    node::{NibbleSlicePlan, NodeHandlePlan},
    DBValue, NibbleSlice, NodeCodec as NodeCodecT, TrieDBMutBuilder, TrieMut,
};
use wasm_bindgen::prelude::*;

type TrieDBMut<'a> = trie_db::TrieDBMut<'a, Layout>;
type TrieError = sp_trie::TrieError<Layout>;

#[cfg(feature = "enable-debug-log")]
fn abort_on_trie_error(error: &TrieError) -> ! {
    match error {
        TrieError::InvalidStateRoot(ref root) => abort!("Invalid state root: {root:?}"),
        TrieError::IncompleteDatabase(ref missing) => {
            abort!("Database missing expected key: {missing:?}")
        },
        TrieError::ValueAtIncompleteKey(ref bytes, ref extra) => {
            abort!("Value found in trie at incomplete key {:?} + {:?}", bytes, extra)
        },
        TrieError::DecoderError(ref hash, ref decoder_err) => {
            abort!("Decoding failed for hash {:?}; err: {:?}", hash, decoder_err)
        },
        TrieError::InvalidHash(ref hash, ref data) => abort!(
            "Encoded node {:?} contains invalid hash reference with length: {}",
            hash,
            data.len()
        ),
    }
}

#[cfg(not(feature = "enable-debug-log"))]
fn abort_on_trie_error(_error: &TrieError) -> ! {
    crate::__abort();
}

fn decode_child_recursive(
    parent: &mut TrieNode,
    child: NodeHandlePlan,
    partial: Option<u8>,
    bytes: &'static [u8],
    db: &dyn HashDB<Blake2Hasher, DBValue>,
    nodes: &mut Vec<TrieNode>,
) {
    let Some(partial) = partial else {
        abort!("extension node not supported");
    };
    match child {
        NodeHandlePlan::Hash(range) => {
            let key = {
                let bytes = &bytes[range.start..range.end];
                let bytes = match TryInto::<&[u8; 32]>::try_into(bytes) {
                    Ok(bytes) => bytes,
                    Err(error) => abort!("{error}"),
                };
                H256(*bytes)
            };
            let maybe_index = nodes.iter().enumerate().find_map(|(index, node)| {
                if let Some(id) = node.id.as_ref() {
                    if &key == id {
                        return Some(index);
                    }
                }
                None
            });
            if let Some(index) = maybe_index {
                parent.children.push(index, partial);
                return;
            }
            if let Some(value) = db.get(&key, EMPTY_PREFIX) {
                let value = value.leak();
                let index = decode_recursive(value, Some(key), db, nodes);
                parent.children.push(index, partial);
            } else {
                abort!("invalid children");
            }
        },
        NodeHandlePlan::Inline(range) => {
            let bytes = &bytes[range.start..range.end];
            let index = decode_recursive(bytes, None, db, nodes);
            parent.children.push(index, partial);
        },
    }
}

fn decode_children_recursive(
    parent: &mut TrieNode,
    children: [Option<NodeHandlePlan>; 16],
    bytes: &'static [u8],
    db: &dyn HashDB<Blake2Hasher, DBValue>,
    nodes: &mut Vec<TrieNode>,
) {
    for (partial, child) in children.into_iter().enumerate() {
        let Some(child) = child else {
            continue;
        };
        let partial = partial as u8;
        decode_child_recursive(parent, child, Some(partial), bytes, db, nodes);
    }
}

pub fn value_to_bytes<'b>(plan: &ValuePlan, data: &'b [u8]) -> &'b [u8] {
    match plan {
        ValuePlan::Inline(range) => &data[range.clone()],
        ValuePlan::Node(range) => &data[range.clone()],
    }
}

pub fn nibble_to_str(
    partial: NibbleSlicePlan,
    bytes: &'static [u8],
) -> Option<NibbleSlice<'static>> {
    let nibbles = partial.build(bytes);
    if nibbles.is_empty() {
        return None;
    }
    Some(nibbles)
}

pub struct TrieNode {
    pub id: Option<H256>,
    pub nibbles: Option<NibbleSlice<'static>>,
    pub value: Option<Vec<u8>>,
    pub children: Children,
    pub raw_bytes: Option<&'static [u8]>,
}

fn decode_recursive(
    bytes: &'static [u8],
    node_id: Option<H256>,
    db: &dyn HashDB<Blake2Hasher, DBValue>,
    nodes: &mut Vec<TrieNode>,
) -> usize {
    let raw_bytes = if node_id.is_none() {
        Some(bytes)
    } else {
        None
    };
    if let Ok(node) = NodeCodec::<Blake2Hasher>::decode_plan(bytes) {
        let node = match node {
            NodePlan::Empty => {
                TrieNode {
                    id: node_id,
                    nibbles: None,
                    value: None,
                    children: Children::new(),
                    raw_bytes,
                }
            },
            NodePlan::Leaf { partial, value } => TrieNode {
                id: node_id,
                nibbles: nibble_to_str(partial, bytes),
                value: Some(Vec::<u8>::from(value_to_bytes(&value, bytes))),
                children: Children::new(),
                raw_bytes,
            },
            NodePlan::Branch { value, children } => {
                let mut parent = TrieNode {
                    id: node_id,
                    nibbles: None,
                    value: value.map(|range| Vec::<u8>::from(value_to_bytes(&range, bytes))),
                    children: Children::new(),
                    raw_bytes,
                };
                decode_children_recursive(&mut parent, children, bytes, db, nodes);
                parent
            },
            NodePlan::NibbledBranch { partial, value, children } => {
                let mut parent = TrieNode {
                    id: node_id,
                    nibbles: nibble_to_str(partial, bytes),
                    value: value.map(|range| Vec::<u8>::from(value_to_bytes(&range, bytes))),
                    children: Children::new(),
                    raw_bytes,
                };
                decode_children_recursive(&mut parent, children, bytes, db, nodes);
                parent
            },
            NodePlan::Extension { partial, child } => {
                let mut parent = TrieNode {
                    id: node_id,
                    nibbles: nibble_to_str(partial, bytes),
                    value: None,
                    children: Children::new(),
                    raw_bytes,
                };
                decode_child_recursive(&mut parent, child, None, bytes, db, nodes);
                parent
            },
        };
        let id = nodes.len();
        nodes.push(node);
        id
    } else {
        abort!("decode_plan failed");
    }
}

pub struct MerklePatriciaTrie<'a> {
    trie: TrieDBMut<'a>,
}

impl<'a> MerklePatriciaTrie<'a> {
    pub fn new(trie: TrieDBMut<'a>) -> Self {
        Self { trie }
    }
    fn extract_input(input: &mut [u8]) -> (Vec<u8>, &mut [u8]) {
        let Some((key_len, input)) = input.split_first_chunk_mut::<4>() else {
            abort!("invalid key");
        };
        let key_len = u32::from_le_bytes(*key_len) as usize;
        let Some((key, rest)) = input.split_at_mut_checked(key_len) else {
            abort!("key out of bounds");
        };
        let vec = unsafe { Vec::from_raw_parts(key.as_mut_ptr(), key.len(), key.len()) };
        (vec, rest)
    }

    pub fn insert(&mut self, input: &mut [u8]) {
        let (key, input) = Self::extract_input(input);
        let (value, input) = Self::extract_input(input);
        if !input.is_empty() {
            abort!("invalid input");
        }
        match self.trie.insert(&key, &value) {
            Ok(_) => self.trie.commit(),
            Err(error) => abort_on_trie_error(error.as_ref()),
        }
    }

    pub fn remove(&mut self, key: &mut [u8]) {
        let key = unsafe { Vec::from_raw_parts(key.as_mut_ptr(), key.len(), key.len()) };
        match self.trie.remove(&key) {
            Ok(_) => self.trie.commit(),
            Err(error) => abort_on_trie_error(error.as_ref()),
        }
    }

    pub fn get(&self, key: &mut [u8]) -> Option<Vec<u8>> {
        let key = unsafe { Vec::from_raw_parts(key.as_mut_ptr(), key.len(), key.len()) };
        match self.trie.get(&key) {
            Ok(value) => value,
            Err(error) => abort_on_trie_error(error.as_ref()),
        }
    }

    pub fn exists(&self, key: &mut [u8]) -> bool {
        let key = unsafe { Vec::from_raw_parts(key.as_mut_ptr(), key.len(), key.len()) };
        match self.trie.contains(&key) {
            Ok(exists) => exists,
            Err(error) => abort_on_trie_error(error.as_ref()),
        }
    }

    pub fn nodes(&mut self) -> JSMerklePatriciaTrie {
        let root_key = *self.trie.root();
        let mut nodes = Vec::<TrieNode>::with_capacity(512);
        let Some(root_data) = self.trie.db().get(&root_key, EMPTY_PREFIX) else {
            abort!("no value for the root key: {root_key:?}");
        };
        let root_data = root_data.leak();
        let index = decode_recursive(root_data, Some(root_key), self.trie.db(), &mut nodes);
        let Some(node) = nodes.get(index) else {
            abort!("invalid node index {index}");
        };
        JSMerklePatriciaTrie::new(node, &nodes)
    }

    pub fn root(&mut self) -> H256 {
        *self.trie.root()
    }
}

#[wasm_bindgen(js_name = "__ext_list_nodes")]
pub fn list_nodes() -> JSMerklePatriciaTrie {
    use crate::storage::ExternalDB;

    // Reset Heap Memory
    #[cfg(not(feature = "dlmalloc"))]
    crate::bump_allocator::BumpAllocator::reset();

    // Load trie root
    let mut db = ExternalDB;
    let mut root = db.get_root_hash();
    let trie_db = TrieDBMutBuilder::<Layout>::from_existing(&mut db, &mut root).build();
    let mut trie = MerklePatriciaTrie::new(trie_db);
    trie.nodes()
}
