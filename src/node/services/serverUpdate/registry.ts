import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { EnvHttpProxyAgent, type Dispatcher } from "undici";
import { z } from "zod";
import {
  SERVER_UPDATE_CHECK_TIMEOUT_MS,
  SERVER_UPDATE_INSTALL_TIMEOUT_MS,
} from "@/constants/serverUpdate";
import { isExactVersion } from "./installLayout";

export type RegistryRequest = (url: string, options: RequestInit) => Promise<Response>;

export interface ReleaseArtifact {
  version: string;
  tarball: string;
  integrity: string;
}

// Built on first use: a malformed proxy variable must surface as a check error, not crash startup.
let dispatcher: Dispatcher | undefined;

function requestOptions(signal: AbortSignal): RequestInit & { dispatcher: Dispatcher } {
  // NODE_TLS_REJECT_UNAUTHORIZED=0 in the server's environment would otherwise let an on-path
  // registry rewrite the tags; explicit options win over that process-wide default, for direct
  // (connect) and proxied (requestTls) connections alike. Redirects are refused because a
  // redirect target may leave HTTPS; the configured registry must answer every request itself.
  dispatcher ??= new EnvHttpProxyAgent({
    connect: { rejectUnauthorized: true },
    requestTls: { rejectUnauthorized: true },
  });
  return { dispatcher, redirect: "error", signal };
}

async function fetchJson(request: RegistryRequest, url: string): Promise<unknown> {
  const response = await request(
    url,
    requestOptions(AbortSignal.timeout(SERVER_UPDATE_CHECK_TIMEOUT_MS))
  );
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
  return response.json();
}

export async function fetchDistTags(
  registry: string,
  request: RegistryRequest = fetch
): Promise<{ latest?: string; next?: string }> {
  const tags = await fetchJson(request, `${registry}/-/package/@coder%2Fxum/dist-tags`);
  if (!tags || typeof tags !== "object") throw new Error("Invalid registry dist-tags response");
  return {
    latest: "latest" in tags && isExactVersion(tags.latest) ? tags.latest : undefined,
    next: "next" in tags && isExactVersion(tags.next) ? tags.next : undefined,
  };
}

const manifestSchema = z.object({
  name: z.literal("@coder/xum"),
  version: z.string(),
  dist: z.object({
    tarball: z.string(),
    integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/),
  }),
});

export async function fetchArtifact(
  registry: string,
  version: string,
  request: RegistryRequest = fetch
): Promise<ReleaseArtifact> {
  if (!isExactVersion(version)) throw new Error("Invalid update version");
  const manifest = manifestSchema.safeParse(
    await fetchJson(request, `${registry}/@coder%2Fxum/${version}`)
  );
  if (!manifest.success || manifest.data.version !== version)
    throw new Error("Registry manifest has no verifiable tarball for the requested version");
  const tarball = new URL(manifest.data.dist.tarball);
  if (tarball.protocol !== "https:" || tarball.username || tarball.password)
    throw new Error("Registry tarball URL is not HTTPS");
  return { version, tarball: tarball.href, integrity: manifest.data.dist.integrity };
}

/** Streams the tarball to `dest` and keeps it only when it matches the manifest's sha512 digest. */
export async function downloadArtifact(
  artifact: ReleaseArtifact,
  dest: string,
  request: RegistryRequest = fetch,
  signal?: AbortSignal
): Promise<void> {
  const timeout = AbortSignal.timeout(SERVER_UPDATE_INSTALL_TIMEOUT_MS);
  const response = await request(
    artifact.tarball,
    requestOptions(signal ? AbortSignal.any([signal, timeout]) : timeout)
  );
  if (!response.ok || !response.body) throw new Error(`Registry returned HTTP ${response.status}`);
  const hash = createHash("sha512");
  const file = await fs.open(dest, "wx");
  try {
    const reader = response.body.getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      hash.update(chunk.value);
      await file.write(chunk.value);
    }
  } finally {
    await file.close();
  }
  if (`sha512-${hash.digest("base64")}` !== artifact.integrity) {
    await fs.rm(dest, { force: true });
    throw new Error("Downloaded update does not match the registry digest");
  }
}
