import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFileAsync } from "@/node/utils/disposableExec";
import {
  SERVER_UPDATE_INSTALL_TIMEOUT_MS,
  SERVER_UPDATE_SMOKE_TIMEOUT_MS,
  SERVER_UPDATE_STAGING_PREFIX,
} from "@/constants/serverUpdate";
import {
  isExactVersion,
  readPackageVersion,
  resolveCliEntry,
  type InstallLayout,
} from "./installLayout";

export function installCommand(
  layout: InstallLayout,
  version: string
): { file: string; args: string[] } {
  if (!isExactVersion(version)) throw new Error("Invalid update version");
  const spec = `@coder/xum@${version}`;
  // CLI flags outrank npmrc files and npm_config_* env, so an inherited strict-ssl=false cannot
  // disable certificate validation for the download. bun has no such setting; its only TLS knob
  // is the env variable runInstall strips.
  const flags = {
    bun: ["add", "--ignore-scripts", "--exact"],
    npm: [
      "install",
      "--no-global",
      "--no-audit",
      "--no-fund",
      "--omit=dev",
      "--ignore-scripts",
      "--strict-ssl",
    ],
    pnpm: ["add", "--no-global", "--ignore-scripts", "--config.strict-ssl=true"],
  } satisfies Record<InstallLayout["packageManager"], string[]>;
  return {
    file: layout.packageManager,
    args: [...flags[layout.packageManager], spec, "--registry", layout.registry],
  };
}

export async function verifyStagedPackage(
  dir: string,
  version: string,
  signal?: AbortSignal
): Promise<string> {
  const packageDir = path.join(dir, "node_modules/@coder/xum");
  if (readPackageVersion(packageDir) !== version)
    throw new Error("Staged package version does not match the requested update");
  const entry = path.join(packageDir, "dist/cli/index.js");
  const stat = await fs.stat(entry);
  if (!stat.isFile()) throw new Error("Staged CLI entry is not a file");
  // The supervisor execs the launcher symlink directly, so the entry must carry a shebang and be
  // executable; a parseable file without them would fail every relaunch attempt.
  const handle = await fs.open(entry);
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(2), 0, 2, 0);
    if (bytesRead < 2 || buffer.toString() !== "#!")
      throw new Error("Staged CLI entry has no interpreter line");
  } finally {
    await handle.close();
  }
  if (process.platform !== "win32" && (stat.mode & 0o111) === 0)
    throw new Error("Staged CLI entry is not executable");
  // Parse-only: nothing from the registry runs until the operator activates it.
  using smoke = execFileAsync(process.execPath, ["--check", entry], {
    timeoutMs: SERVER_UPDATE_SMOKE_TIMEOUT_MS,
    signal,
  });
  await smoke.result;
  return entry;
}

async function runInstall(
  file: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal
): Promise<void> {
  using install = execFileAsync(file, args, {
    cwd,
    // Disables TLS validation process-wide in every manager and cannot be outranked by a flag.
    env: { NODE_TLS_REJECT_UNAUTHORIZED: undefined },
    timeoutMs: SERVER_UPDATE_INSTALL_TIMEOUT_MS,
    killTreeOnTermination: true,
    signal,
  });
  await install.result;
}

export async function stageUpdate(
  layout: InstallLayout,
  version: string,
  install = runInstall,
  signal?: AbortSignal
): Promise<string> {
  const command = installCommand(layout, version);
  // Pruning must never remove the target of a launcher that was re-pointed behind this process.
  if (resolveCliEntry(layout.launcher) !== layout.entry)
    throw new Error("Server launcher changed since startup");
  const parent = path.dirname(layout.workdir);
  const active = await fs.realpath(layout.workdir);
  const dir = path.join(parent, `${SERVER_UPDATE_STAGING_PREFIX}${version}`);
  for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !entry.name.startsWith(SERVER_UPDATE_STAGING_PREFIX) ||
      !isExactVersion(entry.name.slice(SERVER_UPDATE_STAGING_PREFIX.length))
    )
      continue;
    const candidate = path.join(parent, entry.name);
    if ((await fs.realpath(candidate)) !== active) await fs.rm(candidate, { recursive: true });
  }
  // Exclusive creation refuses pre-existing links, and never mutates the running installation.
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ private: true }));
  await install(command.file, command.args, dir, signal);
  return verifyStagedPackage(dir, version, signal);
}
