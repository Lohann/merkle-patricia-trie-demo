// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { Path } from "@david/path";
import { type Command, type CommonBuild, parseArgs } from "./args.ts";
import { buildCommand, type BuildConfig } from "./build.ts";

function createConfig(opt: CommonBuild): BuildConfig {
  const root = new Path(Deno.cwd());

  // Default values
  const crateName = opt.project ?? "rs_lib";
  const optimize = opt.optimize ?? true;
  const stackSize = opt.stackSize ?? 65536;
  const profile = opt.profile ?? (opt.optimize ? "release" : "debug");
  const outDir = opt.outDir ?? "lib";
  const libName = opt.libName;

  // BuildConfig
  return {
    crateName,
    root,

    // Rust Compiler Profile, ex: `--profile <profile>`
    profile,

    // wheter or not wasm should export the memory
    importMemory: false,

    // Max wasm stack size `-C link-arg=-zstack-size=$stackSize`
    stackSize,

    // Enable (+) or Disable (-) wasm features `-C target-feature=$wasmFeatures`
    wasmFeatures: [
      "-atomics",
      "-bulk-memory",
      "-crt-static",
      "-exception-handling",
      "-extended-const",
      "-multivalue",
      "+mutable-globals",
      "-nontrapping-fptoint",
      "+reference-types",
      "-relaxed-simd",
      "-sign-ext",
      "-simd128",
      "-tail-call",
      "-wide-arithmetic",
    ],

    optimize,
    // Enable (+) or Disable (-) wasm features `-C target-feature=$wasmFeatures`
    wasmOptOptions: [
      "-Oz",
      "--dce",
      "--precompute",
      "--precompute-propagate",
      "--optimize-instructions",
      "--optimize-casts",
      "--low-memory-unused",
      "--optimize-added-constants",
      "--optimize-added-constants-propagate",
      "--simplify-globals-optimizing",
      "--inlining-optimizing",
      "--merge-locals",
      "--merge-similar-functions",
      "--strip",
      "--strip-debug",
      "--disable-bulk-memory",
      "--disable-bulk-memory-opt",
      // "--enable-bulk-memory",
      // '--enable-bulk-memory-opt',
      // '--remove-memory',
      "--remove-unused-names",
      "--remove-unused-types",
      "--remove-unused-module-elements",
      "--duplicate-function-elimination",
      "--duplicate-import-elimination",
      "--reorder-functions",
      "--abstract-type-refining",
      "--alignment-lowering",
      "--avoid-reinterprets",
      "--zero-filled-memory",
      "--disable-simd",
      "--disable-relaxed-simd",
      "--disable-threads",
      "--disable-gc",
      "--disable-memory64",
      "--disable-tail-call",
      "--disable-multivalue",
      "--disable-reference-types",
      "--disable-exception-handling",
      "--optimize-stack-ir",
      "--vacuum",
      // '--unsubtyping',
    ],
    libDir: root.join(outDir),
    libName,
  };
}

async function main(command: Command): Promise<void> {
  switch (command.kind) {
    case "build": {
      // Start build process
      const config = createConfig(command);
      await buildCommand(config);
      return;
    }
    case "help": {
      console.log("%build.ts", "font-weight: bold");
      console.log();
      console.log(
        "%cnew %c- Scaffold a new project",
        "color: green",
        "color: reset",
      );
      console.log();
      console.log(
        "%cbuild %c- Build the project",
        "color: green",
        "color: reset",
      );
      console.log();
      console.log("%cBuild options:", "font-style: italic");
      console.log();
      console.log(
        "%c--debug %c- Build without optimizations.",
        "font-weight: bold",
        "font-weight: normal",
      );
      console.log();
      console.log(
        "%c--project <crate_name> / -p <crate_name> %c- Specifies the crate to build when using a Cargo workspace.",
        "font-weight: bold",
        "font-weight: normal",
      );
      console.log();
      console.log(
        "%c--out <dir_path> %c- Specifies the output directory. Defaults to ./lib",
        "font-weight: bold",
        "font-weight: normal",
      );
      console.log();
      console.log(
        "%c--js-ext <ext_no_period> %c- Extension to use for the wasm-bindgen JS files. Defaults to js.",
        "font-weight: bold",
        "font-weight: normal",
      );
      console.log();
      console.log(
        "%c--all-features %c- Build the crate with all features.",
        "font-weight: bold",
        "font-weight: normal",
      );
      console.log();
      console.log(
        "%c--no-default-features %c- Build the crate with no default features.",
        "font-weight: bold",
        "font-weight: normal",
      );
      console.log();
      console.log(
        '%c--features %c- Specify the features to create. Specify multiple features quoted and with spaces (ex. --features "wasm serialization").',
        "font-weight: bold",
        "font-weight: normal",
      );
      console.log();
      console.log(
        "%c--skip-opt %c- Skip running wasm-opt.",
        "font-weight: bold",
        "font-weight: normal",
      );
      console.log();
      console.log(
        "%c--check %c- Checks if the output is up-to-date.",
        "font-weight: bold",
        "font-weight: normal",
      );
      Deno.exit(0);
      break;
    }
    default: {
      const _assertNever: never = command;
      throw new Error("unknown command.");
    }
  }
}

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  const command: Command = parseArgs(Deno.args);
  main(command);
}
