import { os } from "@orpc/server";

// Every RPC-driven mutation (project clone/create/remove, workspace rename, archive, ...) is in
// flight for exactly as long as its procedure call, so counting calls gates restarts on all of
// them without enumerating each operation. Subscriptions return their iterator immediately and
// therefore do not pin the count; the install call itself is the restart and is excluded.
let inFlight = 0;

export function inFlightProcedureCount(): number {
  return inFlight;
}

export async function trackInFlightProcedure<T>(path: readonly string[], run: () => Promise<T>) {
  if (path.join(".") === "update.install") return run();
  inFlight++;
  try {
    return await run();
  } finally {
    inFlight--;
  }
}

export const inFlightProcedureMiddleware = os.middleware(async ({ path, next }) => {
  return await trackInFlightProcedure(path, async () => next());
});
