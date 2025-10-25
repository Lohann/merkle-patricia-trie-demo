// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

use crate::storage::EMPTY_PTR;
use core::num::NonZeroU32;
use ext::HostFn;

pub enum HostFnImpl {}

impl HostFnImpl {
    #[inline(always)]
    pub fn log(str: &str) {
        unsafe {
            HostFn::log(str.as_ptr(), str.len() as u32);
        }
    }

    #[inline(always)]
    pub fn input(output: &mut &mut [u8]) {
        let mut output_len = output.len() as u32;
        {
            unsafe { HostFn::input(output.as_mut_ptr(), &mut output_len) };
        }
        extract_from_slice(output, output_len as usize);
    }

    #[inline(always)]
    pub fn set_storage(key: &[u8], encoded_value: &[u8]) -> Option<NonZeroU32> {
        let ret_code = unsafe {
            HostFn::set_storage(
                key.as_ptr(),
                key.len() as u32,
                encoded_value.as_ptr(),
                encoded_value.len() as u32,
            )
        };
        NonZeroU32::new(ret_code)
    }

    #[inline(always)]
    pub fn get_storage(mut key: &[u8], output: &mut &mut [u8]) -> Option<NonZeroU32> {
        let mut output_len = output.len() as u32;
        let ret_code = {
            unsafe {
                if key.is_empty() {
                    key = EMPTY_PTR;
                }
                HostFn::get_storage(
                    key.as_ptr(),
                    key.len() as u32,
                    output.as_mut_ptr(),
                    &mut output_len,
                )
            }
        };
        extract_from_slice(output, output_len as usize);
        NonZeroU32::new(ret_code)
    }

    #[inline(always)]
    pub fn clear_storage(key: &[u8]) -> Option<NonZeroU32> {
        let ret_code = { unsafe { HostFn::clear_storage(key.as_ptr(), key.len() as u32) } };
        NonZeroU32::new(ret_code)
    }
}

#[inline(always)]
fn extract_from_slice(output: &mut &mut [u8], new_len: usize) {
    debug_assert!(new_len <= output.len());
    let tmp = core::mem::take(output);
    *output = &mut tmp[..new_len];
}

// external methods defined outside webassembly.
// https://github.com/paritytech/polkadot-sdk/blob/polkadot-stable2509/substrate/frame/contracts/uapi/src/host/wasm32.rs
pub(crate) mod ext {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen(raw_module = "../lib.exports.ts")]
    extern "C" {
        pub(crate) type HostFn;

        #[wasm_bindgen(js_name = "__ext_log", static_method_of = HostFn)]
        pub unsafe fn log(ptr: *const u8, len: u32);

        #[wasm_bindgen(js_name = "__ext_input", static_method_of = HostFn)]
        pub unsafe fn input(buf_ptr: *mut u8, buf_len_ptr: *mut u32);

        #[wasm_bindgen(js_name = "__ext_set_storage", static_method_of = HostFn)]
        pub unsafe fn set_storage(
            key_ptr: *const u8,
            key_len: u32,
            value_ptr: *const u8,
            value_len: u32,
        ) -> u32;

        #[wasm_bindgen(js_name = "__ext_get_storage", static_method_of = HostFn)]
        pub unsafe fn get_storage(
            key_ptr: *const u8,
            key_len: u32,
            out_ptr: *mut u8,
            out_len_ptr: *mut u32,
        ) -> u32;

        #[wasm_bindgen(js_name = "__ext_clear_storage", static_method_of = HostFn)]
        pub unsafe fn clear_storage(key_ptr: *const u8, key_len: u32) -> u32;
    }
}
