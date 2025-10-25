// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { Path } from "@david/path";
import { zlibSync } from "fflate";
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

interface WasmBase64Result {
  uncompressedSize: number;
  compressedSize: number;
  base64: string;
  summary: string;
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
  const base64FileName = `${wasmName}_base64.ts`;
  const base64File = config.libDir.join(base64FileName);

  // Compile Rust to WebAssembly
  const cargoBuildParams = await compile(config);
  const originalSize = await computeFileSize(inputFile);

  // Create javascript bindings
  const wasmBindgenParams = await wasmBindgen(config, inputFile, wasmName);

  // Optimize WebAssembly Code
  const unoptimizedSize = await computeFileSize(wasmFile);
  let optimizedSize = 0;
  if (config.optimize) {
    await optimizeWASM(config, wasmFile);
    optimizedSize = await computeFileSize(wasmFile);
  }

  // Generate readable WAT file
  await generateWAT(config.root, wasmFile, watFile);

  // Generate WASM to base64 compressed.
  const base64Result = await wasm2base64(wasmFile);
  console.log(base64Result.summary);
  await base64File.writeText([
    "// @generated file from build.ts -- do not edit",
    "// deno-lint-ignore-file",
    "// deno-fmt-ignore-file",
    "// eslint-disable",
    `export const sizeIn: number = ${base64Result.compressedSize} as const;`,
    `export const sizeOut: number = ${base64Result.uncompressedSize} as const;`,
    `export const data: string = ${
      splitLines(base64Result.base64, 80, 80 - 28)
    } as const;\n`,
  ].join("\n"));
  const base64FileSize = await computeFileSize(base64File);

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
  const originalKB = formatKilobytes(originalSize);
  const unoptimizedKB = formatKilobytes(unoptimizedSize);
  const optimizedKB = optimizedSize
    ? formatKilobytes(optimizedSize)
    : "skipped";
  const compressedKB = formatKilobytes(base64Result.compressedSize);
  const base64KB = formatKilobytes(base64FileSize);
  const pad2 = [unoptimizedKB, optimizedKB, compressedKB, base64KB].reduce(
    (a, b) => Math.max(a, b.length),
    originalKB.length,
  );

  const padding = Math.min(wasmName.length - 9, 0);
  console.log(
    ` ---------------------------- SUMMARY ----------------------------`,
  );
  console.log(` SOURCE: ${pathRelative(config.root, inputFile)}`);
  console.log(`COMMAND:\n${cargoBuildShellCMD(cargoBuildParams)}\n`);
  console.log(`BINDGEN:\n${wasmBindgenParams.join(" ")}\n`);
  console.log("  FILES:");
  console.log(
    `    - ${wasmFileName.padEnd(padding, " ")}         (original): ${
      originalKB.padStart(pad2)
    }`,
  );
  console.log(
    `    - ${wasmFileName}      (unoptimized): ${unoptimizedKB.padStart(pad2)}`,
  );
  console.log(
    `    - ${wasmFileName}        (optimized): ${optimizedKB.padStart(pad2)}`,
  );
  console.log(
    `    - ${base64FileName}     (compressed): ${compressedKB.padStart(pad2)}`,
  );
  console.log(
    `    - ${base64FileName}         (base64): ${base64KB.padStart(pad2)}`,
  );
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

/* Compress the Wasm binary */
async function wasm2base64(file: Path): Promise<WasmBase64Result> {
  const data: Uint8Array = await file.readBytes();
  const compressed: Uint8Array = zlibSync(data, { level: 9 });
  const base64 = compressed.toBase64();
  const summary = [
    `*** Compressed WASM: in=${formatKilobytes(data.length)}`,
    `out=${formatKilobytes(compressed.length)}`,
    `opt=${(100 * compressed.length / data.length).toFixed(2)}%`,
    `base64=${formatKilobytes(base64.length)}`,
  ].join(", ");
  const result: WasmBase64Result = {
    uncompressedSize: data.length,
    compressedSize: compressed.length,
    base64,
    summary,
  };
  return result;
}

/* Helper Functions */
async function computeFileSize(file: Path): Promise<number> {
  // `file.stat().size` sometimes doesn't return the correct size.
  return (await file.readBytes()).length;
}

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

function splitLines(str: string, maxLen: number, firstLine = maxLen): string {
  const array = [];
  let i = 0;
  firstLine -= 1;
  if (str.length >= firstLine) {
    array.push(str.substring(0, firstLine));
    i += firstLine;
  }
  while ((str.length - i) >= maxLen) {
    array.push(str.substring(i, maxLen + i));
    i += maxLen;
  }
  if (i < str.length) {
    array.push(str.substring(i));
  }
  const lines = array.map((line) => {
    const jsonStr = JSON.stringify(line);
    return jsonStr.substring(1, jsonStr.length - 1);
  }).join("\\\n");
  return `"${lines}"`;
}

type Separator = { thousand: string; decimal: string };
/// Get the decimal and thousand separator of a locale
function getSeparator(locale?: string): Separator {
  return {
    decimal: (0.1).toLocaleString(locale, { useGrouping: false }).charAt(1),
    thousand: (1000).toLocaleString(locale, { useGrouping: true }).replace(
      /\d/g,
      "",
    ).charAt(0),
  };
}

/// Formats a number into string format with thousand separators
function formatKilobytes(bytes: number, locale = "en"): string {
  const { decimal } = getSeparator(locale);
  const n = (BigInt(bytes) * 10n) / 1024n;
  const num = n / 10n;
  const den = n % 10n;
  return `${num}${decimal}${den}kb`;
}
