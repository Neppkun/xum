function isLocalHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  // Cleartext is a development-only escape hatch for literal LAN addresses,
  // not arbitrary DNS names which could resolve to a public server.
  if (/^\[(?:f[cd][\da-f]{2}:|fe[89ab][\da-f]:)/i.test(hostname)) return true;
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** The endpoint is a server base URL, including any reverse-proxy path prefix. */
export function normalizeEndpoint(input: string): string {
  const value = input.trim();
  // Reject even empty ?/#, and URL-parser repairs that could hide credentials or
  // silently change the host/path. Errors must never echo user input or tokens.
  if (!/^https?:\/\/[^/]/i.test(value) || /[\s\p{Cc}\\?#]/u.test(value)) {
    throw new Error("Enter an HTTP(S) server URL without credentials, query, or fragment.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid server URL.");
  }
  if (url.username || url.password || value.split("/")[2].includes("@")) {
    throw new Error("Enter the server token separately, not in the URL.");
  }
  if (url.protocol === "http:" && !isLocalHost(url.hostname)) {
    throw new Error(
      "Remote servers require HTTPS. HTTP is only allowed for localhost or private LAN addresses."
    );
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Show a warning: native HTTP LAN development sends the token without TLS. */
export function isInsecureEndpoint(endpoint: string): boolean {
  return normalizeEndpoint(endpoint).startsWith("http:");
}
