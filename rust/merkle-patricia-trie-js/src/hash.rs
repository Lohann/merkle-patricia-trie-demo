const PRIME32_1: u32 = 0x9E3779B1;
const PRIME32_2: u32 = 0x85EBCA77;
const PRIME32_3: u32 = 0xC2B2AE3D;
const PRIME32_4: u32 = 0x27D4EB2F;
const PRIME32_5: u32 = 0x165667B1;

type Lane = u32;
type Lanes = [Lane; 4];
type Bytes = [u8; 16];
const BYTES_IN_LANE: usize = core::mem::size_of::<Bytes>();

#[inline(always)]
const fn round(mut acc: u32, lane: u32) -> u32 {
  acc = acc.wrapping_add(lane.wrapping_mul(PRIME32_2));
  acc = acc.rotate_left(13);
  acc.wrapping_mul(PRIME32_1)
}

#[unsafe(no_mangle)]
pub fn xxhash32(seed: u32, mut data: &[u8]) -> u32 {
  let len = data.len() as u64;

  // Since we know that there's no more data coming, we don't
  // need to construct the intermediate buffers or copy data to
  // or from the buffers.

  // let mut accumulators = Accumulators::new(seed);
  let mut accumulators = [
    seed.wrapping_add(PRIME32_1).wrapping_add(PRIME32_2),
    seed.wrapping_add(PRIME32_2),
    seed,
    seed.wrapping_sub(PRIME32_1),
  ];
  // finish_with(seed, len.into_u64(), &accumulators, data)

  while let Some((chunk, rest)) = data.split_first_chunk::<BYTES_IN_LANE>() {
    // SAFETY: We have the right number of bytes and are
    // handling the unaligned case.
    let lanes = unsafe { chunk.as_ptr().cast::<Lanes>().read_unaligned() };
    {
      let [acc1, acc2, acc3, acc4] = &mut accumulators;
      let [lane1, lane2, lane3, lane4] = lanes;

      *acc1 = round(*acc1, lane1.to_le());
      *acc2 = round(*acc2, lane2.to_le());
      *acc3 = round(*acc3, lane3.to_le());
      *acc4 = round(*acc4, lane4.to_le());
    }
    data = rest;
  }

  let mut acc = if len < (BYTES_IN_LANE as u64) {
    seed.wrapping_add(PRIME32_5)
  } else {
    let [acc1, acc2, acc3, acc4] = accumulators;
    let acc1 = acc1.rotate_left(1);
    let acc2 = acc2.rotate_left(7);
    let acc3 = acc3.rotate_left(12);
    let acc4 = acc4.rotate_left(18);
    acc1
      .wrapping_add(acc2)
      .wrapping_add(acc3)
      .wrapping_add(acc4)
  };
  acc += len as u32;

  while let Some((chunk, rest)) = data.split_first_chunk() {
    let lane = u32::from_ne_bytes(*chunk).to_le();

    acc = acc.wrapping_add(lane.wrapping_mul(PRIME32_3));
    acc = acc.rotate_left(17).wrapping_mul(PRIME32_4);

    data = rest;
  }
  for &byte in data {
    let lane: u32 = byte.into();
    acc = acc.wrapping_add(lane.wrapping_mul(PRIME32_5));
    acc = acc.rotate_left(11).wrapping_mul(PRIME32_1);
  }
  // Step 6. Final mix (avalanche)
  acc ^= acc >> 15;
  acc = acc.wrapping_mul(PRIME32_2);
  acc ^= acc >> 13;
  acc = acc.wrapping_mul(PRIME32_3);
  acc ^= acc >> 16;

  acc
}


#[cfg(test)]
mod tests {
  use super::*;
  const SANITY_BUFFER_SIZE: usize = 4096 + 64 + 1;

  fn byte_gen(buffer: &mut [u8]) {
    const PRIME32: u32 = 2654435761;
    const PRIME64: u64 = 11400714785074694797;

    let mut byte_gen = PRIME32 as u64;
    for ptr in buffer {
      *ptr = (byte_gen >> 56) as u8;
      byte_gen = byte_gen.wrapping_mul(PRIME64);
    }
  }

  #[test]
  fn test_xxhash32() {
    let test_cases = [
      [0, 0x00000000u32, 0x02CC5D05u32],
      [0, 0x9E3779B1u32, 0x36B78AE7u32],
      [1, 0x00000000u32, 0xCF65B03Eu32],
      [1, 0x9E3779B1u32, 0xB4545AA4u32],
      [2, 0x00000000u32, 0x1151BEE4u32],
      [2, 0x9E3779B1u32, 0x1EDB879Au32],
      [3, 0x00000000u32, 0xC23884F5u32],
      [3, 0x9E3779B1u32, 0x1A269947u32],
      [4, 0x00000000u32, 0xA9DE7CE9u32],
      [4, 0x9E3779B1u32, 0x2BAAFE83u32],
      [5, 0x00000000u32, 0xEB1734BBu32],
      [5, 0x9E3779B1u32, 0x5874DAB0u32],
      [6, 0x00000000u32, 0x659F0C97u32],
      [6, 0x9E3779B1u32, 0x0BCF25C5u32],
      [7, 0x00000000u32, 0x5E1056CDu32],
      [7, 0x9E3779B1u32, 0x3ED9D3FCu32],
      [8, 0x00000000u32, 0xA3F6F44Bu32],
      [8, 0x9E3779B1u32, 0xC2A8E239u32],
      [9, 0x00000000u32, 0xFFB82A24u32],
      [9, 0x9E3779B1u32, 0xD35632C6u32],
      [10, 0x00000000u32, 0xB1E5032Eu32],
      [10, 0x9E3779B1u32, 0x18679D60u32],
      [11, 0x00000000u32, 0x0CF2F032u32],
      [11, 0x9E3779B1u32, 0xE0E99838u32],
    ];

    let mut buffer = vec![0u8; SANITY_BUFFER_SIZE];
    byte_gen(&mut buffer);
    for [len, seed, expected] in test_cases {
      let len = len as usize;
      let data = &buffer[0..len];
      assert_eq!(xxhash32(seed, data), expected);
    }
  }
}
