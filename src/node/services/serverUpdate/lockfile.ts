import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as jsonc from "jsonc-parser";
import YAML from "yaml";
import { z } from "zod";
import {
  SERVER_UPDATE_LOCKFILES,
  SERVER_UPDATE_VERIFY_CONCURRENCY,
} from "@/constants/serverUpdate";
import { isExactVersion, type InstallLayout } from "./installLayout";
import { fetchPublishedDigests, type RegistryRequest } from "./registry";

/** One package a manager's lockfile records, before any trust decision. */
interface LockedPackage {
  name: string;
  version: string;
  integrity?: string;
  /** Explicit location (URL or local path); absent when derived from the configured registry. */
  resolved?: string;
}

/** Splits `name@resolution`; a scoped name keeps its leading `@`. */
function splitSpec(spec: string): [name: string, resolution: string] {
  const at = spec.lastIndexOf("@");
  return at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : [spec, ""];
}

const bunMeta = z.object({ bundled: z.boolean().optional() });
const bunLock = z.object({
  packages: z.record(
    z.string(),
    z.union([
      // Registry releases: spec, tarball URL ("" when derived from the registry), meta, sri.
      z
        .tuple([z.string(), z.string(), bunMeta, z.string().optional()])
        .transform(([spec, registry, meta, integrity]) => ({
          spec,
          registry,
          bundled: meta.bundled === true,
          integrity,
        })),
      // Every other resolution kind names its location in the spec.
      z.tuple([z.string(), bunMeta]).transform(([spec]) => ({ spec })),
    ])
  ),
});
const npmLock = z.object({
  packages: z.record(
    z.string(),
    z.object({
      // Present when the installed folder name is an alias for another package.
      name: z.string().optional(),
      version: z.string().optional(),
      resolved: z.string().optional(),
      integrity: z.string().optional(),
      inBundle: z.boolean().optional(),
    })
  ),
});
const pnpmLock = z.object({
  packages: z.record(
    z.string(),
    z.object({
      version: z.string().optional(),
      resolution: z.object({ integrity: z.string().optional(), tarball: z.string().optional() }),
    })
  ),
});

const lockfileParsers: Record<InstallLayout["packageManager"], (raw: string) => LockedPackage[]> = {
  bun: (raw) =>
    Object.values(bunLock.parse(jsonc.parse(raw)).packages).flatMap((entry): LockedPackage[] => {
      const [name, resolution] = splitSpec(entry.spec);
      if (!("registry" in entry)) return [{ name, version: "", resolved: resolution }];
      // Bundled packages ship inside their parent's verified tarball.
      if (entry.bundled) return [];
      return [
        {
          name,
          version: resolution,
          integrity: entry.integrity,
          resolved: entry.registry || undefined,
        },
      ];
    }),
  npm: (raw) =>
    Object.entries(npmLock.parse(JSON.parse(raw)).packages).flatMap(([key, pkg]) =>
      key === "" || pkg.inBundle
        ? []
        : [
            {
              name:
                pkg.name ?? key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length),
              version: pkg.version ?? "",
              integrity: pkg.integrity,
              resolved: pkg.resolved,
            },
          ]
    ),
  pnpm: (raw) =>
    Object.entries(pnpmLock.parse(YAML.parse(raw)).packages).map(([key, pkg]) => {
      // v6 keys are `/name@version(peer@x)`; v9 drops the slash. A local tarball entry carries its
      // real version separately.
      const [name, resolution] = splitSpec(key.replace(/^\//, "").replace(/\(.*$/, ""));
      return {
        name,
        version: pkg.version ?? resolution,
        integrity: pkg.resolution.integrity,
        resolved: pkg.resolution.tarball,
      };
    }),
};

const isLocal = (resolved: string) =>
  /^(file:|\.\.?\/)/.test(resolved) || path.isAbsolute(resolved);

/**
 * Anchors the staged dependency tree to the configured registry. Managers follow redirects (also
 * to plaintext) while resolving dependencies and record whatever digest they were served, so the
 * lockfile alone proves nothing; each recorded digest must equal the one the registry publishes
 * over verified HTTPS without redirects. Managers do verify every tarball against its recorded
 * digest, which makes that digest the only link that needs anchoring. Returns the verified count.
 */
export async function verifyStagedDependencies(
  layout: InstallLayout,
  dir: string,
  request: RegistryRequest = fetch,
  signal?: AbortSignal
): Promise<number> {
  const lockfile = path.join(dir, SERVER_UPDATE_LOCKFILES[layout.packageManager]);
  const queue: Array<{ name: string; version: string; integrity: string }> = [];
  for (const pkg of lockfileParsers[layout.packageManager](await fs.readFile(lockfile, "utf8"))) {
    if (pkg.resolved !== undefined && isLocal(pkg.resolved)) {
      // The release tarball itself was digest-checked before the install.
      if (pkg.name === "@coder/xum") continue;
      throw new Error(`Dependency ${pkg.name} was installed from a local path`);
    }
    if (pkg.resolved !== undefined && !pkg.resolved.startsWith("https://"))
      throw new Error(`Dependency ${pkg.name} was not resolved over HTTPS`);
    if (!isExactVersion(pkg.version) || !pkg.integrity)
      throw new Error(`Dependency ${pkg.name} is not a digest-pinned registry release`);
    queue.push({ name: pkg.name, version: pkg.version, integrity: pkg.integrity });
  }
  const total = queue.length;
  const worker = async () => {
    for (let pkg = queue.shift(); pkg; pkg = queue.shift()) {
      try {
        const published = await fetchPublishedDigests(
          layout.registry,
          pkg.name,
          pkg.version,
          request,
          signal
        );
        if (!pkg.integrity.split(/\s+/).some((sri) => published.includes(sri)))
          throw new Error(
            `Registry digest for ${pkg.name}@${pkg.version} differs from the staged lockfile`
          );
      } catch (error) {
        queue.length = 0;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: SERVER_UPDATE_VERIFY_CONCURRENCY }, worker));
  return total;
}
