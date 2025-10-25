<div align="center">

<h1><code>Merkle Patricia Trie Demo</code></h1>
</div>

## About

I started this project for learning purposes, but it also may be useful for
anyone who wish to learn how the
[Merkle Patricia Trie](https://ethereum.org/developers/docs/data-structures-and-encoding/patricia-merkle-trie/)
(or merkle radix-16 trie) used by many blockchains like **Ethereum** and
**Polkadot** works under the hoods.

### 🚴 Dependencies

- [DenoJS](https://deno.com/), which replaces NodeJS,
  [more info here](https://www.youtube.com/watch?v=M3BM9TB-8yA).
- [cargo and rust](https://rust-lang.org/tools/install/) used to implement the
  trie at `rust/merkle-radix-trie/src`.
- [wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen) for generate the
  JS files and bindings between Rust, WebAssembly and Javascript.
- [wasm-opt](https://github.com/brson/wasm-opt-rs) to optimize the webassembly
  binary.
- [wasm-tools](https://github.com/bytecodealliance/wasm-tools) to strip debug
  info from wasm binary and geneate WAT files.

### 🐑 Install dependencies

1. Install DenoJS following the instructions here:
   https://docs.deno.com/runtime/getting_started/installation/
2. Install rust following the instructions here
   https://rust-lang.org/tools/install/
3. Install rust nightly toolchain and components.

```shell
# This project requires rust 1.92.0 nightly toolchain
# newer versions may work too.
rustup install nightly-2025-10-04

rustup component add rust-src rustfmt --toolchain nightly-2025-10-04
rustup target add wasm32-unknown-unknown --toolchain nightly-2025-10-04
rustup target add wasm32v1-none --toolchain nightly-2025-10-04
```

4. Install the tools necessary generate the bindings between Rust and
   Typescript:

```shell
rustup run nightly-2024-09-05 cargo install wasm-bindgen-cli --version 0.2.104 --force --locked
rustup run nightly-2024-09-05 cargo install wasm-opt --version 0.116.1 --force --locked
rustup run nightly-2024-09-05 cargo install wasm-tools --version 1.239.0 --force --locked
```

### 🛠️ Build

```shell
# Compile Rust to WebAssembly
deno task build:wasm

# Compile ReactJS tsx files
deno task build:wasm

# Same as running the two above in parallel,
# but the terminal output will be a mess.
deno task build
```

### 🔬 Test in the Browser

```
# Start a development server at port 3000
deno task dev
```

## License

Merkle Patricia Trie Demo code is released under the
[BSD-3-Clause License](LICENSE).
