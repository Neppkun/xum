import { describe, expect, test } from "bun:test";
import { inFlightProcedureCount, trackInFlightProcedure } from "./inFlightProcedures";

describe("in-flight procedure tracking", () => {
  test("counts calls for their whole duration and settles on failure too", async () => {
    let release!: () => void;
    const pending = trackInFlightProcedure(
      ["workspace", "remove"],
      () => new Promise<void>((resolve) => (release = resolve))
    );
    expect(inFlightProcedureCount()).toBe(1);
    release();
    await pending;
    expect(inFlightProcedureCount()).toBe(0);
    let failed = false;
    try {
      await trackInFlightProcedure(["project", "create"], () => Promise.reject(new Error("boom")));
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(inFlightProcedureCount()).toBe(0);
  });

  test("the install call never blocks its own restart", async () => {
    let release!: () => void;
    const pending = trackInFlightProcedure(
      ["update", "install"],
      () => new Promise<void>((resolve) => (release = resolve))
    );
    expect(inFlightProcedureCount()).toBe(0);
    release();
    await pending;
  });
});
