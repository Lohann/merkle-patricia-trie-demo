// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

use crate::{abort, host::HostFnImpl, trie::MerklePatriciaTrie};

use core::{num::NonZeroUsize, ptr::NonNull};
use hash_db::{AsHashDB, HashDB, Hasher};
use sp_core::{bounded::alloc::vec::Vec, Blake2Hasher, H256};
use sp_trie::{DBValue, TrieDBMutBuilder};

pub const HASHED_NULL_NODE: H256 =
    H256(hex_literal::hex!("03170a2e7597b7b7e3d84c05391d139a62b157e78786d8c082f29dcf4c111314"));
pub const EMPTY_PTR: &mut [u8] = unsafe {
    let mut ptr = NonNull::<u8>::without_provenance(NonZeroUsize::new(1).unwrap());
    core::slice::from_raw_parts_mut(ptr.as_mut(), 0)
};

pub type Layout = sp_trie::LayoutV1<Blake2Hasher>;

pub struct ExternalDB;

impl ExternalDB {
    pub fn get_root_hash(&self) -> H256 {
        let mut hash = H256::zero();
        let buffer = &mut hash.as_bytes_mut();
        let Some(code) = HostFnImpl::get_storage(EMPTY_PTR, buffer) else {
            match buffer.len() {
                32 => {},
                0 => {
                    hash = HASHED_NULL_NODE;
                    self.set_root_hash(&hash);
                },
                len => abort!("get_root_hash: expected 32, got {len}"),
            }
            return hash;
        };
        if code.get() == 3 {
            hash = HASHED_NULL_NODE;
            self.set_root_hash(&hash);
        } else {
            abort!("get_root_hash: get_storage failed with code: {}", code.get());
        }
        hash
    }

    pub fn set_root_hash(&self, hash: &H256) {
        if let Some(error) = HostFnImpl::set_storage(EMPTY_PTR, hash.as_bytes()) {
            abort!("set_root_hash: set_storage failed with code {}", error.get());
        }
    }

    pub fn internal_emplace(&self, key: &H256, value: &[u8]) {
        let counter = self.get_storage_counter(key) + 1;
        if counter == 1 {
            if let Some(error) = HostFnImpl::set_storage(key.as_bytes(), value) {
                abort!("internal_emplace: set_storage failed with code {}", error.get());
            }
        }
        self.set_storage_counter(key, counter);
    }

    pub fn get_storage_counter(&self, key: &H256) -> i32 {
        let mut bytes = [0u8; 4];
        let mut counter_key = [0u8; 33];
        counter_key[32] = 0xff;
        counter_key[0..32].copy_from_slice(&key.0);
        {
            let mut buffer = bytes.as_mut_slice();
            if let Some(error) = HostFnImpl::get_storage(&counter_key[..], &mut buffer) {
                if error.get() == 3 {
                    return 0;
                }
                abort!("get_storage_counter: get_storage failed with code {}", error.get());
            }
            // let res = HostFn::get_storage(key.as_ptr(), 16, bytes.as_mut_ptr(), &mut len);
            if buffer.is_empty() {
                return 0;
            }
            if buffer.len() != 4 {
                abort!("get_storage_counter: len != 4");
            }
        }
        i32::from_ne_bytes(bytes)
    }

    fn set_storage_counter(&self, key: &H256, counter: i32) {
        let mut counter_key = [0u8; 33];
        counter_key[32] = 0xff;
        counter_key[0..32].copy_from_slice(&key.0);
        if counter == 0 {
            if let Some(error) = HostFnImpl::clear_storage(&counter_key[..]) {
                abort!("set_storage_counter: clear_storage failed with code {}", error.get());
            }
        } else {
            let bytes = counter.to_ne_bytes();
            if let Some(error) = HostFnImpl::set_storage(&counter_key[..], bytes.as_slice()) {
                abort!("set_storage_counter: set_storage failed with code {}", error.get());
            }
        }
    }
}

impl AsHashDB<Blake2Hasher, trie_db::DBValue> for ExternalDB {
    fn as_hash_db(&self) -> &dyn HashDB<Blake2Hasher, trie_db::DBValue> {
        self
    }

    fn as_hash_db_mut<'a>(
        &'a mut self,
    ) -> &'a mut (dyn HashDB<Blake2Hasher, trie_db::DBValue> + 'a) {
        self
    }
}

// const MAX_VALUE_SIZE: usize = 8192;
const MAX_VALUE_SIZE: usize = 4096;
impl HashDB<Blake2Hasher, DBValue> for ExternalDB {
    fn get(&self, key: &H256, _prefix: hash_db::Prefix) -> Option<DBValue> {
        if key == &HASHED_NULL_NODE {
            return Some([0].to_vec());
        }
        let mut buffer = [0u8; MAX_VALUE_SIZE];
        let mut buffer_slice = &mut buffer[..];
        if let Some(error) = HostFnImpl::get_storage(key.as_bytes(), &mut buffer_slice) {
            if error.get() == 3 {
                return None;
            }
            abort!("[get_storage]: failed with code {}", error.get());
        }
        if buffer_slice.len() >= MAX_VALUE_SIZE {
            abort!("[get_storage]: buffer overflow: {} < {}", MAX_VALUE_SIZE, buffer_slice.len());
        }
        Some(Vec::from(buffer_slice))
    }

    fn contains(&self, key: &H256, _prefix: hash_db::Prefix) -> bool {
        if key == &HASHED_NULL_NODE {
            return true;
        }
        self.get_storage_counter(key) > 0
    }

    fn insert(&mut self, _prefix: hash_db::Prefix, value: &[u8]) -> H256 {
        if value.is_empty() || matches!(value, &[0]) {
            return HASHED_NULL_NODE;
        }

        let key = <Blake2Hasher as Hasher>::hash(value);
        self.internal_emplace(&key, value);
        key
    }

    fn emplace(&mut self, key: H256, _prefix: hash_db::Prefix, value: DBValue) {
        if value.is_empty() || key == HASHED_NULL_NODE {
            return;
        }
        self.internal_emplace(&key, value.as_ref());
    }

    fn remove(&mut self, key: &H256, _prefix: hash_db::Prefix) {
        if key == &HASHED_NULL_NODE {
            return;
        }
        let counter = self.get_storage_counter(key);
        if counter == 1 {
            if let Some(error) = HostFnImpl::clear_storage(key.as_bytes()) {
                abort!("remove: clear_storage failed with code {}", error.get());
            }
        }
        if counter > 0 {
            self.set_storage_counter(key, counter - 1);
        }
    }
}

fn __load_input(buffer: &'static mut [u8], _len: &mut u32) -> &'static mut [u8] {
    let mut buffer = buffer;
    let input_len = buffer.len();
    HostFnImpl::input(&mut buffer);
    if buffer.len() != input_len {
        abort!("input length mismatch, expected {input_len} got {}", buffer.len());
    }
    buffer
}

#[export_name = "__ext_call"]
pub unsafe extern "C" fn call(code: u32, input_len: u32) -> u64 {
    use crate::bump_allocator::BumpAllocator;
    // Reset Heap Memory
    BumpAllocator::reset();

    crate::debug_log!("__ext_call({code}, {input_len})");

    // Read input
    let input = BumpAllocator::pre_allocate_buffer(input_len, __load_input);

    // Load trie root
    let mut db = ExternalDB;
    let mut root = db.get_root_hash();
    let trie_db = TrieDBMutBuilder::<Layout>::from_existing(&mut db, &mut root).build();
    let mut trie = MerklePatriciaTrie::new(trie_db);

    // Process the call
    match code {
        0 => {
            trie.insert(input);
            drop(trie);
            db.set_root_hash(&root);
            return 0;
        },
        1 => {
            trie.remove(input);
            drop(trie);
            db.set_root_hash(&root);
            return 0;
        },
        2 => {
            return u64::from(trie.exists(input));
        },
        3 => {
            let value = trie.get(input).map(Vec::<u8>::leak);
            if let Some(value) = value {
                let ptr = value.as_mut_ptr() as u32;
                let len = value.len() as u32;
                return (ptr as u64) << 32 | (len as u64);
            }
            return 0;
        },
        4 => {
            let value = Vec::<u8>::from(trie.root().as_fixed_bytes()).leak();
            let ptr = value.as_mut_ptr() as u32;
            let len = value.len() as u32;
            return (ptr as u64) << 32 | (len as u64);
        },
        _ => {},
    }
    abort!("invalid call");
}
