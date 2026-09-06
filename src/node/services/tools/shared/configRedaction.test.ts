import { describe, expect, it } from "bun:test";
import { redactConfigDocument, REDACTED_SECRET_VALUE } from "./configRedaction";

describe("Codex account redaction", () => {
  it("removes all account credentials without changing the source document", () => {
    const auth = {
      type: "oauth",
      access: "private-access",
      refresh: "private-refresh",
      expires: 12345,
    };
    const document = {
      openai: {
        codexOauth: auth,
        codexOauthAccounts: { work: { label: "Work", auth } },
        codexOauthDefaultAccountId: "work",
      },
    };

    const redacted = redactConfigDocument("providers", document);
    expect(redacted).toEqual({
      openai: {
        codexOauth: REDACTED_SECRET_VALUE,
        codexOauthAccounts: REDACTED_SECRET_VALUE,
        codexOauthDefaultAccountId: "work",
      },
    });
    expect(JSON.stringify(redacted)).not.toContain(auth.access);
    expect(JSON.stringify(redacted)).not.toContain(auth.refresh);
    expect(document.openai.codexOauthAccounts.work.auth).toEqual(auth);
  });
});
