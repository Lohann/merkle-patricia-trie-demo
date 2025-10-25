// Copyright (C) Use Ink (UK) Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @date: 14/10/2025
// @author Lohann Paterno Coutinho Ferreira.
//
// This is a modified version of Ink! smart-contract Bump allocator.
// It was chosen because this code is stateless, so memory can (and must)
// be wiped between calls.
//
// original source: https://github.com/use-ink/ink/blob/v5.1.1/crates/allocator/src/bump.rs

//! A simple bump allocator.
//!
//! The heap which is used by this allocator is built from pages of Wasm memory (each page
//! is `64KiB`). We will request new pages of memory as needed until we run out of memory,
//! at which point we will crash with an `OOM` error instead of freeing any memory.
use crate::abort;
use core::alloc::{GlobalAlloc, Layout};

/// A page in Wasm is `64KiB`
const PAGE_SIZE: usize = 64 * 1024;

static mut INNER: Option<InnerAlloc> = None;

/// A bump allocator suitable for use in a Wasm environment.
pub struct BumpAllocator;

impl BumpAllocator {
    pub fn reset() {
        unsafe {
            #[allow(static_mut_refs)]
            let inner = &mut INNER;
            if inner.is_some() {
                abort!("memory already initialized");
            }
            *inner = Some(InnerAlloc::new());
        }
    }

    pub fn pre_allocate_buffer<R>(size: u32, callback: fn(&'static mut [u8], &mut u32) -> R) -> R {
        #[allow(static_mut_refs)]
        unsafe {
            let Some(mut inner) = INNER.take() else {
                abort!("recursive call to pre_allocate_buffer");
            };
            let mut len = size;
            let layout = Layout::from_size_align_unchecked(len as usize, 1);
            let Some(ptr) = inner.alloc(layout) else {
                abort!("out of memory");
            };
            let buffer = core::slice::from_raw_parts_mut(ptr as *mut u8, len as usize);
            let result = callback(buffer, &mut len);
            if len > size {
                abort!("seg fault");
            }
            inner.next = ptr + (len as usize);
            if INNER.is_some() {
                abort!("memory initialized during pre_allocate_buffer");
            }
            INNER = Some(inner);
            result
        }
    }
}

unsafe impl GlobalAlloc for BumpAllocator {
    #[inline]
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        #[allow(static_mut_refs)]
        let inner = INNER.get_or_insert_with(InnerAlloc::new);
        match inner.alloc(layout) {
            Some(start) => start as *mut u8,
            None => core::ptr::null_mut(),
        }
    }

    #[inline]
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        // A new page in Wasm is guaranteed to already be zero initialized, so we can just
        // use our regular `alloc` call here and save a bit of work.
        //
        // See: https://webassembly.github.io/spec/core/exec/modules.html#growing-memories
        self.alloc(layout)
    }

    #[inline]
    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {}
}

#[cfg_attr(any(not(target_arch = "wasm32"), test), derive(Debug, Copy, Clone))]
struct InnerAlloc {
    /// Points to the start of the next available allocation.
    next: usize,

    /// The address of the upper limit of our heap.
    upper_limit: usize,
}

impl InnerAlloc {
    fn new() -> Self {
        Self { next: Self::heap_start(), upper_limit: Self::heap_end() }
    }

    #[cfg(any(not(target_arch = "wasm32"), test))]
    fn heap_start() -> usize {
        0
    }

    #[cfg(any(not(target_arch = "wasm32"), test))]
    fn heap_end() -> usize {
        0
    }

    /// Request a `pages` number of page sized sections of Wasm memory. Each page is `64KiB` in
    /// size.
    ///
    /// Returns `None` if a page is not available.
    ///
    /// This implementation is only meant to be used for testing, since we cannot (easily)
    /// test the `wasm32` implementation.
    #[cfg(any(not(target_arch = "wasm32"), test))]
    fn request_pages(&mut self, _pages: usize) -> Option<usize> {
        Some(self.upper_limit)
    }

    #[cfg(all(target_arch = "wasm32", not(test)))]
    fn heap_start() -> usize {
        extern "C" {
            static __heap_base: usize;
        }
        // # SAFETY
        //
        // The `__heap_base` symbol is defined by the wasm linker and is guaranteed
        // to point to the start of the heap.
        let heap_start = unsafe { &__heap_base as *const usize as usize };
        // if the symbol isn't found it will resolve to 0
        // for that to happen the rust compiler or linker need to break or change
        assert_ne!(heap_start, 0, "Can't find `__heap_base` symbol.");
        heap_start
    }

    #[cfg(all(target_arch = "wasm32", not(test)))]
    fn heap_end() -> usize {
        // Cannot overflow on this architecture
        core::arch::wasm32::memory_size(0) * PAGE_SIZE
    }

    /// Request a `pages` number of pages of Wasm memory. Each page is `64KiB` in size.
    ///
    /// Returns `None` if a page is not available.
    #[cfg(all(target_arch = "wasm32", not(test)))]
    fn request_pages(&mut self, pages: usize) -> Option<usize> {
        let prev_page = core::arch::wasm32::memory_grow(0, pages);
        if prev_page == usize::MAX {
            return None;
        }

        // Cannot overflow on this architecture
        Some(prev_page * PAGE_SIZE)
    }

    /// Tries to allocate enough memory on the heap for the given `Layout`. If there is
    /// not enough room on the heap it'll try and grow it by a page.
    ///
    /// Note: This implementation results in internal fragmentation when allocating across
    /// pages.
    fn alloc(&mut self, layout: Layout) -> Option<usize> {
        let alloc_start = self.align_ptr(&layout);

        let aligned_size = layout.size();

        let alloc_end = alloc_start.checked_add(aligned_size)?;

        if alloc_end > self.upper_limit {
            let required_pages = required_pages(aligned_size)?;
            let page_start = self.request_pages(required_pages)?;

            self.upper_limit = required_pages
                .checked_mul(PAGE_SIZE)
                .and_then(|pages| page_start.checked_add(pages))?;
            self.next = page_start.checked_add(aligned_size)?;

            Some(page_start)
        } else {
            self.next = alloc_end;
            Some(alloc_start)
        }
    }

    /// Aligns the start pointer of the next allocation.
    ///
    /// We inductively calculate the start index
    /// of a layout in the linear memory.
    /// - Initially `self.next` is `0`` and aligned
    /// - `layout.align() - 1` accounts for `0` as the first index.
    /// - the binary with the inverse of the align creates a bitmask that is used to zero out bits,
    ///   ensuring alignment according to type requirements and ensures that the next allocated
    ///   pointer address is of the power of 2.
    fn align_ptr(&self, layout: &Layout) -> usize {
        (self.next + layout.align() - 1) & !(layout.align() - 1)
    }
}

/// Calculates the number of pages of memory needed for an allocation of `size` bytes.
///
/// This function rounds up to the next page. For example, if we have an allocation of
/// `size = PAGE_SIZE / 2` this function will indicate that one page is required to
/// satisfy the allocation.
#[inline]
fn required_pages(size: usize) -> Option<usize> {
    size.checked_add(PAGE_SIZE - 1).and_then(|num| num.checked_div(PAGE_SIZE))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::mem::size_of;

    #[test]
    fn can_alloc_no_bytes() {
        let mut inner = InnerAlloc::new();

        let layout = Layout::new::<()>();
        assert_eq!(inner.alloc(layout), Some(0));

        let expected_limit = PAGE_SIZE * required_pages(layout.pad_to_align().size()).unwrap();
        assert_eq!(inner.upper_limit, expected_limit);

        let expected_alloc_start = size_of::<()>();
        assert_eq!(inner.next, expected_alloc_start);
    }

    #[test]
    fn can_alloc_a_byte() {
        let mut inner = InnerAlloc::new();

        let layout = Layout::new::<u8>();
        assert_eq!(inner.alloc(layout), Some(0));

        let expected_limit = PAGE_SIZE * required_pages(layout.pad_to_align().size()).unwrap();
        assert_eq!(inner.upper_limit, expected_limit);

        let expected_alloc_start = size_of::<u8>();
        assert_eq!(inner.next, expected_alloc_start);
    }

    #[test]
    fn can_alloc_a_foobarbaz() {
        let mut inner = InnerAlloc::new();

        struct FooBarBaz {
            _foo: u32,
            _bar: u128,
            _baz: (u16, bool),
        }

        let layout = Layout::new::<FooBarBaz>();
        let mut total_size = 0;

        let allocations = 3;
        for _ in 0..allocations {
            assert!(inner.alloc(layout).is_some());
            total_size += layout.pad_to_align().size();
        }

        let expected_limit = PAGE_SIZE * required_pages(total_size).unwrap();
        assert_eq!(inner.upper_limit, expected_limit);

        let expected_alloc_start = allocations * size_of::<FooBarBaz>();
        assert_eq!(inner.next, expected_alloc_start);
    }

    #[test]
    fn can_alloc_across_pages() {
        let mut inner = InnerAlloc::new();

        struct Foo {
            _foo: [u8; PAGE_SIZE - 1],
        }

        // First, let's allocate a struct which is _almost_ a full page
        let layout = Layout::new::<Foo>();
        assert_eq!(inner.alloc(layout), Some(0));

        let expected_limit = PAGE_SIZE * required_pages(layout.pad_to_align().size()).unwrap();
        assert_eq!(inner.upper_limit, expected_limit);

        let expected_alloc_start = size_of::<Foo>();
        assert_eq!(inner.next, expected_alloc_start);

        // Now we'll allocate two bytes which will push us over to the next page
        let layout = Layout::new::<u16>();
        assert_eq!(inner.alloc(layout), Some(PAGE_SIZE));

        let expected_limit = 2 * PAGE_SIZE;
        assert_eq!(inner.upper_limit, expected_limit);

        // Notice that we start the allocation on the second page, instead of making use
        // of the remaining byte on the first page
        let expected_alloc_start = PAGE_SIZE + size_of::<u16>();
        assert_eq!(inner.next, expected_alloc_start);
    }

    #[test]
    fn can_alloc_multiple_pages() {
        let mut inner = InnerAlloc::new();

        struct Foo {
            _foo: [u8; 2 * PAGE_SIZE],
        }

        let layout = Layout::new::<Foo>();
        assert_eq!(inner.alloc(layout), Some(0));

        let expected_limit = PAGE_SIZE * required_pages(layout.pad_to_align().size()).unwrap();
        assert_eq!(inner.upper_limit, expected_limit);

        let expected_alloc_start = size_of::<Foo>();
        assert_eq!(inner.next, expected_alloc_start);

        // Now we want to make sure that the state of our allocator is correct for any
        // subsequent allocations
        let layout = Layout::new::<u8>();
        assert_eq!(inner.alloc(layout), Some(2 * PAGE_SIZE));

        let expected_limit = 3 * PAGE_SIZE;
        assert_eq!(inner.upper_limit, expected_limit);

        let expected_alloc_start = 2 * PAGE_SIZE + size_of::<u8>();
        assert_eq!(inner.next, expected_alloc_start);
    }

    #[test]
    fn correct_alloc_types() {
        let mut inner = InnerAlloc::new();
        let layout1 = Layout::for_value(&Vec::<u128>::with_capacity(3));
        assert_eq!(inner.alloc(layout1), Some(0));
        assert_eq!(inner.next, 24);

        let layout2 = Layout::for_value(&Vec::<u128>::with_capacity(1));
        assert_eq!(inner.alloc(layout2), Some(24));
        assert_eq!(inner.next, 48);
    }
}
