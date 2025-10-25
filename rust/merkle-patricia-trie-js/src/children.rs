// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

use crate::abort;
use core::{marker::PhantomData, ptr::NonNull};

pub struct Children {
    mask: u16,
    children: [usize; 16],
}

impl Children {
    pub fn new() -> Self {
        Self { mask: 0, children: [usize::MAX; 16] }
    }

    pub fn push(&mut self, val: usize, partial: u8) {
        let mask = self.mask;
        let flag = 1u16.wrapping_shl(partial as u32);
        if partial >= 16 || (flag & mask) != 0 {
            abort!("an node can have at maximum 16 children");
        }
        self.children[partial as usize] = val;
        self.mask = mask | flag;
    }

    pub fn iter(&self) -> ChildrenIter<'_> {
        ChildrenIter::new(self)
    }
}

impl Default for Children {
    fn default() -> Self {
        Self::new()
    }
}

impl<'a> IntoIterator for &'a Children {
    type Item = (usize, u8);
    type IntoIter = ChildrenIter<'a>;
    #[inline(always)]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

pub struct ChildrenIter<'a> {
    ptr: NonNull<usize>,
    mask: u16,
    _marker: PhantomData<&'a Children>,
}

impl<'a> ChildrenIter<'a> {
    #[inline]
    pub(super) const fn new(children: &'a Children) -> Self {
        let slice = &children.children;
        let mask = children.mask;
        let ptr: NonNull<usize> = NonNull::from_ref(slice).cast();
        Self { ptr, mask, _marker: PhantomData }
    }
}
unsafe impl Sync for ChildrenIter<'_> {}
unsafe impl Send for ChildrenIter<'_> {}

impl Clone for ChildrenIter<'_> {
    #[inline]
    fn clone(&self) -> Self {
        Self { ptr: self.ptr, mask: self.mask, _marker: self._marker }
    }
}

impl<'a> Iterator for ChildrenIter<'a> {
    type Item = (usize, u8);

    fn next(&mut self) -> Option<Self::Item> {
        let mask = self.mask;
        if mask == 0 {
            return None;
        }
        let next = ((!mask) + 1) & mask;
        let offset = next.trailing_zeros() as u8;
        self.mask ^= next;
        unsafe {
            core::hint::assert_unchecked(offset < 16);
            let value = self.ptr.add(offset as usize).read();
            if value == usize::MAX {
                abort!("[bug] ChildrenIter")
            }
            Some((value, offset))
        }
    }
}
