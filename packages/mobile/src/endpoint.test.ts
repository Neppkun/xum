import { describe, expect, test } from "bun:test";
import { isInsecureEndpoint, normalizeEndpoint } from "./endpoint";

describe("mobile endpoints", () => {
  test("preserves proxy prefixes and normalizes origin and trailing slash", () => {
    expect(normalizeEndpoint(" HTTPS://Example.COM:443/@user/workspace/apps/xum/// ")).toBe(
      "https://example.com/@user/workspace/apps/xum"
    );
    expect(normalizeEndpoint("https://example.com")).toBe("https://example.com");
  });

  test.each([
    "https://user:secret@example.com",
    "https://user@example.com",
    "https://@example.com",
    "https:////example.com",
    "https://example.com\u0000",
    "https://example.com?token=secret",
    "https://example.com?",
    "https://example.com#",
    "ftp://example.com",
    "ws://localhost",
    "file:///tmp",
    "example.com",
    "https://",
    "https://example.com\\@other.com",
    "https://exa\nmple.com",
    "http://example.com",
    "http://172.32.0.1",
    "http://192.169.0.1",
    "http://10.0.0.1.example.com",
    "http://0.0.0.0",
    "http://[2001:4860:4860::8888]",
  ])("rejects unsafe endpoint %s without echoing input", (input) => {
    let error: unknown;
    try {
      normalizeEndpoint(input);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(input);
    expect(String(error)).not.toContain("secret");
  });

  test.each([
    "localhost",
    "127.0.0.1",
    "10.0.0.2",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.2",
    "[::1]",
    "[fd00::1]",
    "[fe80::1]",
  ])("allows explicit local development with a cleartext warning: %s", (host) => {
    const endpoint = `http://${host}:3000/proxy`;
    expect(normalizeEndpoint(endpoint)).toBe(endpoint);
    expect(isInsecureEndpoint(endpoint)).toBe(true);
    expect(isInsecureEndpoint(`https://${host}:3000/proxy`)).toBe(false);
  });
});
