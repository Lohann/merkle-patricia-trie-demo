// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { Path } from "@david/path";
import { CargoWorkspace, type WasmCrate } from "./manifest.ts";

export interface BuildConfig {
  crateName: string;
  root: Path;
  importMemory: boolean;
  stackSize: number;
  wasmFeatures: string[];
  optimize: boolean;
  profile: string;
  wasmOptOptions: string[];
  libDir: Path;
  libName?: string;
}

interface CargoMetadata {
  libName: string;
  targetName: string;
  targetDirectory: Path;
}

interface CargoBuildParams {
  CARGO_CMD: string[];
  CARGO_ENCODED_RUSTFLAGS: string[];
  ENV_VARS: { [key: string]: string };
}

export async function buildCommand(config: BuildConfig): Promise<void> {
  // Load Manifest
  const {
    libName: targetName,
    // targetName,
    targetDirectory,
  } = await getManifest(config);
  const inputFile = targetDirectory.join(
    "wasm32-unknown-unknown",
    config.profile,
    `${targetName}.wasm`,
  );
  const wasmName = config.libName ?? targetName;
  const wasmFileName = `${wasmName}_bg.wasm`;
  const wasmFile = config.libDir.join(wasmFileName);
  const watFile = config.libDir.join(`${wasmName}_bg.wat`);

  // Compile Rust to WebAssembly
  const cargoBuildParams = await compile(config);
  const originalSize = await computeFileSize(inputFile);

  // Create javascript bindings
  const wasmBindgenParams = await wasmBindgen(config, inputFile, wasmName);

  // Optimize WebAssembly Code
  const unoptimizedSize = await computeFileSize(wasmFile);
  let optimizedSize = "skipped";
  if (config.optimize) {
    await optimizeWASM(config, wasmFile);
    optimizedSize = await computeFileSize(wasmFile);
  }

  // Generate readable WAT file
  await generateWAT(config.root, wasmFile, watFile);

  // Update comments in the generated files
  prependToFile(
    config.libDir.join(`${wasmName}_bg.wasm.d.ts`),
    "// @generated file from build.ts -- do not edit",
    "// deno-lint-ignore-file",
    "// deno-fmt-ignore-file",
    "",
  );

  prependToFile(
    config.libDir.join(`${wasmName}.js`),
    "// @generated file from build.ts -- do not edit",
    "// @ts-nocheck: generated",
    "// deno-lint-ignore-file",
    "// deno-fmt-ignore-file",
    `// @ts-self-types="./${wasmName}.d.ts"`,
    "",
  );

  prependToFile(
    config.libDir.join(`${wasmName}.d.ts`),
    "// @generated file from wasmbuild -- do not edit",
    "// deno-lint-ignore-file",
    "// deno-fmt-ignore-file",
    "",
  );

  // Summary
  const padding = Math.min(wasmName.length - 9, 0);
  console.log(
    ` ---------------------------- SUMMARY ----------------------------`,
  );
  console.log(` SOURCE: ${pathRelative(config.root, inputFile)}`);
  console.log(`COMMAND:\n${cargoBuildShellCMD(cargoBuildParams)}\n`);
  console.log(`BINDGEN:\n${wasmBindgenParams.join(" ")}\n`);
  console.log("  FILES:");
  console.log(
    `    - ${
      wasmFileName.padEnd(padding, " ")
    }         (original): ${originalSize}`,
  );
  console.log(`    - ${wasmFileName} (unoptimized): ${unoptimizedSize}`);
  console.log(`    - ${wasmFileName}   (optimized): ${optimizedSize}`);
  console.log(
    ` ------------------------------------------------------------------`,
  );
}

/* Read and parse the cargo manifest */
async function getManifest(config: BuildConfig): Promise<CargoMetadata> {
  const p = new Deno.Command("cargo", {
    cwd: config.root.toString(),
    args: ["metadata", "--format-version", "1"],
    stdout: "piped",
  });
  const output = await p.output();
  if (!output.success) {
    throw new Error("Error retrieving cargo metadata.");
  }
  const manifestText = new TextDecoder().decode(output.stdout);
  const workspace = new CargoWorkspace(JSON.parse(manifestText));
  const wasmCrates = workspace.getWasmCrates();
  const wasmCrate = wasmCrates.find((crate: WasmCrate) => {
    if (crate.name === config.crateName) {
      return crate;
    }
  });
  if (wasmCrate === undefined) {
    if (workspace.metadata.workspace_members.length === 0) {
      throw new Error("No cargo project found!");
    }
    if (wasmCrates.length > 0) {
      const crate = wasmCrates.map((crate) => crate.name).join(", ");
      throw new Error(
        `Crate '${config.crateName}' not found, did you mean ${crate}?`,
      );
    }
    const crates = workspace.getWorkspacePackages().map((crate) => crate.name);
    if (crates.includes(config.crateName)) {
      throw new Error(
        `Crate '${config.crateName}' isn't 'wasm32-unknown-unknown' compatible!`,
      );
    }
    if (crates.length > 0) {
      throw new Error(
        `There's no WASM compatible crates in this project: ${
          crates.join(", ")
        }`,
      );
    }
    throw new Error("No cargo project found!");
  }
  return {
    libName: wasmCrate!.libName,
    targetName: wasmCrate!.name,
    targetDirectory: new Path(workspace.metadata.target_directory),
  };
}

/* Compile rust code to wasm32-unknown-unknown */
async function compile(config: BuildConfig): Promise<CargoBuildParams> {
  // Prepare CARGO_ENCODED_RUSTFLAGS
  const home = Deno.env.get("HOME");
  const CARGO_ENCODED_RUSTFLAGS = [
    ...(
      Deno.env.get("CARGO_ENCODED_RUSTFLAGS")?.split("\x1f") ??
        Deno.env.get("RUSTFLAGS")?.split(" ") ??
        []
    ),
    `--remap-path-prefix=${config.root}=.`,
    `--remap-path-prefix=${home}=~`,
    `-Clink-arg=-zstack-size=${config.stackSize}`,
    "-Ctarget-cpu=mvp",
    "-Clinker-plugin-lto",
  ];

  if (config.importMemory) {
    // Configure the wasm target to import instead of export memory
    CARGO_ENCODED_RUSTFLAGS.push("-Clink-arg=--import-memory");
  }

  if (config.wasmFeatures.length > 0) {
    // Enable/Disable Rust Compiler Wasm features
    const wasmFeatures = config.wasmFeatures.join(",");
    CARGO_ENCODED_RUSTFLAGS.push(`-Ctarget-feature=${wasmFeatures}`);
  }

  // Prepare CARGO_CMD
  const CARGO_CMD = [
    "+nightly",
    "build",
    "--lib",
    `--package=${config.crateName}`,
    "--target=wasm32-unknown-unknown",
    `--profile=${config.profile}`,
    "--no-default-features",
    // "--features=enable-debug-log",
  ];

  // Prepare ENV_VARS
  const ENV_VARS = {
    "SOURCE_DATE_EPOCH": "1600000000",
    "TZ": "UTC",
    "LC_ALL": "C",
  };

  // Create BuildCMD
  const buildCMD = { CARGO_CMD, CARGO_ENCODED_RUSTFLAGS, ENV_VARS };

  // Run command
  const cargoBuildReleaseCmdProcess = new Deno.Command("cargo", {
    cwd: config.root.toString(),
    args: CARGO_CMD,
    env: Object.assign({
      "CARGO_ENCODED_RUSTFLAGS": CARGO_ENCODED_RUSTFLAGS.join("\x1f"),
    }, ENV_VARS),
  }).spawn();
  const cargoBuildReleaseCmdOutput = await cargoBuildReleaseCmdProcess.status;
  CARGO_CMD.unshift("cargo");
  if (!cargoBuildReleaseCmdOutput.success) {
    const CMD = cargoBuildShellCMD(buildCMD);
    console.error(`cargo build failed:\n${CMD}`);
    Deno.exit(1);
  }
  return buildCMD;
}

/* Generate wasm bindings */
async function wasmBindgen(
  config: BuildConfig,
  inputFile: Path,
  libName: string,
): Promise<string[]> {
  const outputDir = config.root.relative(config.libDir);
  const wasmFile = config.root.relative(inputFile);
  const wasmBindgenArgs = [
    `--out-dir=${outputDir}`,
    `--out-name=${libName}`,
    "--target=web",
    "--remove-producers-section",
    "--remove-name-section",
    wasmFile,
  ];

  const bindgenProc = new Deno.Command("wasm-bindgen", {
    cwd: config.root.toString(),
    args: wasmBindgenArgs,
  }).spawn();
  wasmBindgenArgs.unshift("wasm-bindgen");
  const output = await bindgenProc.status;
  if (!output.success) {
    console.log("COMMAND:");
    console.log(wasmBindgenArgs.join(" "));
    throw new Error("wasm-bindgen failed.");
  }
  return wasmBindgenArgs;
}

/* Optmize wasm */
async function optimizeWASM(
  config: BuildConfig,
  wasmFilePath: Path,
): Promise<void> {
  const command1 = new Deno.Command("wasm-opt", {
    cwd: config.root.toString(),
    // args: ["-Oz", wasmFilePath.toString(), "-o", wasmFilePath.toString()],
    args: config.wasmOptOptions.concat([
      wasmFilePath.toString(),
      "-o",
      wasmFilePath.toString(),
    ]),
    stdin: "inherit",
    stderr: "inherit",
    stdout: "inherit",
  }).spawn();
  const status = await command1.status;
  if (!status.success) {
    throw new Error(`error executing wasmopt`);
  }

  const command2 = new Deno.Command("wasm-tools", {
    cwd: config.root.toString(),
    args: ["strip", wasmFilePath.toString(), "-o", wasmFilePath.toString()],
    stdin: "inherit",
    stderr: "inherit",
    stdout: "inherit",
  }).spawn();
  const status2 = await command2.status;
  if (!status2.success) {
    throw new Error(`error executing wasm-tools`);
  }
}

/* Generate WAT file */
async function generateWAT(
  root: Path,
  wasmFilePath: Path,
  outputWatFile: Path,
): Promise<void> {
  const command = new Deno.Command("wasm-tools", {
    cwd: root.toString(),
    args: ["print", wasmFilePath.toString()],
    stdin: "inherit",
    stderr: "inherit",
    stdout: "piped",
  }).spawn();
  const { stdout, success } = await command.output();
  if (!success) {
    throw new Error(`error executing wasm-opt`);
  }
  const watCode = new TextDecoder().decode(stdout);
  outputWatFile.writeTextSync(watCode);
}

/* Edit generated files */
const REGEX_EOL = /\r?\n/gm;
function prependToFile(filePath: Path, ...header: string[]): void {
  let lines = filePath.readTextSync().split(REGEX_EOL);
  // Remove typescript lint flags
  let skip = 0;
  for (let line of lines) {
    line = line.trim();
    if (
      line.length === 0 || line.startsWith("// ") ||
      (line.startsWith("/* ") && line.endsWith("disable */"))
    ) {
      skip++;
      continue;
    }
    break;
  }
  lines = lines.slice(skip);

  // Place header
  const content = header.concat(lines).join("\n");
  filePath.writeTextSync(content, { create: false, append: false });
}

/* Generate WAT file */
async function computeFileSize(file: Path): Promise<string> {
  const stat = await file.stat();
  if (!stat) {
    throw new Error(`can\'t read file size: ${file.toString()}`);
  }
  const kilobytes = Math.round(stat.size / 1024);
  return `${kilobytes}kb`;
}

/* Helper Functions */
function pathRelative(from: Path, to: Path): string {
  const relativePath = from.relative(to);
  if (relativePath.startsWith("/") || relativePath.length <= 2) {
    return relativePath;
  }
  return `./${relativePath}`;
}

/// Single quote `cmd`, escape only single quotes.
function shellQuoted(cmd: string): string {
  cmd = cmd.replace(/'/g, "\\'");
  return `'${cmd}'`;
}

/// Sanitize shell special characters
function shellEscape(cmd: string, quoted?: boolean): string {
  if (quoted) {
    cmd = cmd.replace(/(["$`\\])/g, "\\$1");
    return shellQuoted(cmd);
  }
  return cmd.replace(/(["'$`\\])/g, "\\$1");
}

/// Convert the `CargoBuildParams` into a shell command.
function cargoBuildShellCMD(opt: CargoBuildParams): string {
  const {
    CARGO_CMD,
    CARGO_ENCODED_RUSTFLAGS,
  } = opt;

  // printf is necessary to split the `CARGO_ENCODED_RUSTFLAGS` flags using \x1f
  const fmt = shellQuoted(
    Array(CARGO_ENCODED_RUSTFLAGS.length).fill("\\x1f").join(""),
  );
  const params = CARGO_ENCODED_RUSTFLAGS.map((arg) => shellEscape(arg, true))
    .join(" ");
  const printf = `printf ${fmt} ${params}`;

  // assign the encoded flags into a variable
  const rustflags = `CARGO_ENCODED_RUSTFLAGS="$(${printf})"`;

  // now join all environment variables and command
  const envVars = [
    rustflags,
    "SOURCE_DATE_EPOCH='1600000000'",
    "TZ='UTC'",
    "LC_ALL='C'",
  ].map((envVar) => `set ${envVar};`).join("");

  // Build the final command
  return `${envVars} ${CARGO_CMD.join(" ")}`;
}
