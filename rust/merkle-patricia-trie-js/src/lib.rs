// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#![cfg_attr(all(target_arch = "wasm32", not(test)), no_std, no_main)]

#[cfg(not(feature = "dlmalloc"))]
mod bump_allocator;

mod children;
mod hash;
mod host;
mod storage;
mod trie;
mod trie_builder;

use crate::alloc::string::String;

#[cfg(not(feature = "enable-debug-log"))]
use crate::alloc::string::ToString;

use wasm_bindgen::prelude::*;

#[cfg(not(feature = "std"))]
#[cfg_attr(any(test, feature = "enable-debug-log"), macro_use)]
extern crate alloc;

#[cfg(not(feature = "dlmalloc"))]
pub type Allocator = bump_allocator::BumpAllocator;

#[cfg(not(feature = "dlmalloc"))]
const fn allocator() -> Allocator {
    bump_allocator::BumpAllocator
}

#[cfg(feature = "dlmalloc")]
pub type Allocator = dlmalloc::GlobalDlmalloc;

#[cfg(feature = "dlmalloc")]
const fn allocator() -> Allocator {
    dlmalloc::GlobalDlmalloc
}

#[global_allocator]
static mut ALLOC: Allocator = allocator();

#[macro_export]
macro_rules! abort {
  ($($arg:tt)*) => {{
    {
        #[cfg(feature = "enable-debug-log")]
        {
            let msg = format!($($arg)*);
            $crate::host::HostFnImpl::log(msg.as_str());
        }

        $crate::__abort();
    }
  }};
}

#[macro_export]
macro_rules! debug_log {
  ($($arg:tt)*) => {{
    #[cfg(feature = "enable-debug-log")]
    {
        let msg = format!($($arg)*);
        $crate::host::HostFnImpl::log(msg.as_str());
    }
  }};
}

#[cold]
pub(crate) fn __abort() -> ! {
    #[cfg(not(all(target_arch = "wasm32", any(target_os = "unknown", target_os = "none"))))]
    std::process::abort();

    #[cfg(all(target_arch = "wasm32", any(target_os = "unknown", target_os = "none")))]
    core::arch::wasm32::unreachable();
}

#[cfg(all(target_arch = "wasm32", not(test)))]
#[panic_handler]
unsafe fn panic(info: &core::panic::PanicInfo) -> ! {
    let mut msg = info.to_string();

    // Add the error stack to our message.
    //
    // This ensures that even if the `console` implementation doesn't
    // include stacks for `console.error`, the stack is still available
    // for the user. Additionally, Firefox's console tries to clean up
    // stack traces, and ruins Rust symbols in the process
    // (https://bugzilla.mozilla.org/show_bug.cgi?id=1519569) but since
    // it only touches the logged message's associated stack, and not
    // the message's contents, by including the stack in the message
    // contents we make sure it is available to the user.
    msg.push_str("\n\nStack:\n\n");
    let e = Error::new();
    let stack = e.stack();
    msg.push_str(&stack);

    // Safari's devtools, on the other hand, _do_ mess with logged
    // messages' contents, so we attempt to break their heuristics for
    // doing that by appending some whitespace.
    // https://github.com/rustwasm/console_error_panic_hook/issues/7
    msg.push_str("\n\n");

    // Finally, log the panic with `console.error`!
    error(msg);
    core::arch::wasm32::unreachable()
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn error(msg: String);

    type Error;

    #[wasm_bindgen(constructor)]
    fn new() -> Error;

    #[wasm_bindgen(structural, method, getter)]
    fn stack(error: &Error) -> String;
}
