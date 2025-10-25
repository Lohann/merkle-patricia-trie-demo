// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { parseArgs as parseFlags } from "@std/cli/parse-args";
import { Path } from "@david/path";

export type Command = BuildCommand | HelpCommand;

export interface HelpCommand {
  kind: "help";
}

export interface CommonBuild {
  optimize: boolean;
  outDir?: string;
  profile?: string;
  project?: string;
  cargoFlags: string[];
  stackSize?: number;
  libName?: string;
}

export interface BuildCommand extends CommonBuild {
  kind: "build";
}

export function parseArgs(rawArgs: string[]): Command {
  const flags = parseFlags(rawArgs, {
    "--": true,
    string: [
      "features",
      "p",
      "project",
      "o",
      "output",
      "stack-size",
      "profile",
      "lib-name",
    ],
    boolean: ["debug", "help", "h", "optimize"],
    collect: ["features"],
    negatable: ["optimize"],
    default: {
      optimize: true,
      debug: false,
      help: false,
      h: false,
    },
  });

  if (flags.help || flags.h) return { kind: "help" };

  switch (flags._[0]) {
    case "build":
    case undefined:
    case null:
      return {
        kind: "build",
        ...getCommonBuild(),
      };
    default:
      throw new Error(`Unrecognized sub command: ${flags._[0]}`);
  }

  function getCommonBuild(): CommonBuild {
    if (flags.sync) {
      throw new Error(
        "The --sync flag has been renamed to --inline.",
      );
    }
    if (flags.p && flags.project) {
      throw new Error(
        "Project defined twice, use [-p <project>] or [--project <project>]",
      );
    }
    let stackSize: number | undefined = undefined;
    if (flags["stack-size"]) {
      const value = Number.parseInt(flags["stack-size"]);
      if (Number.isNaN(value) || !Number.isSafeInteger(value)) {
        throw new Error(
          `--stack-size is not a valid integer value: '${flags["stack-size"]}'`,
        );
      }
      stackSize = value;
    }
    const libName: string | undefined = flags["lib-name"];
    if (libName) {
      if (!/^\w+[\w_-]*$/.test(libName)) {
        throw new Error(
          `invalid --lib-name='${libName}', it must contains only letters, number or underscore.`,
        );
      }
    }

    return {
      optimize: flags.optimize,
      profile: flags.profile,
      project: flags.p ?? flags.project,
      outDir: flags.o ?? flags.output,
      cargoFlags: getCargoFlags(),
      stackSize,
      libName,
    };
  }

  function getCargoFlags(): string[] {
    const cargoFlags = [];

    if (flags["no-default-features"]) {
      cargoFlags.push("--no-default-features");
    }
    if (flags["features"]) {
      cargoFlags.push(`--features`);
      cargoFlags.push(flags["features"].join(","));
    }
    if (flags["all-features"]) {
      cargoFlags.push("--all-features");
    }
    if (flags["--"]) {
      const tempFlags: string[] = flags["--"];
      cargoFlags.concat(tempFlags);
    }

    return cargoFlags;
  }
}
