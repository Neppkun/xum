import { ORPCError, os } from "@orpc/server";
import type { ServerService } from "@/node/services/serverService";

// Every RPC-driven mutation (project clone/create/remove, workspace rename, archive, ...) is in
// flight for exactly as long as its procedure call, so counting calls gates restarts on all of
// them without enumerating each operation. Subscriptions return their iterator immediately and
// therefore do not pin the count; the install call itself is the restart and is excluded.
let inFlight = 0;

export function inFlightProcedureCount(): number {
  return inFlight;
}

export async function trackInFlightProcedure<T>(
  path: readonly string[],
  admit: () => boolean,
  run: () => Promise<T>
) {
  if (path.join(".") === "update.install") return run();
  // Teardown keeps serving the socket until the very end; a mutation admitted then would be
  // killed half-done by the exit, so refuse every new call once shutdown has begun.
  if (!admit()) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Server is shutting down" });
  inFlight++;
  try {
    return await run();
  } finally {
    inFlight--;
  }
}

// Optional because unit tests assemble partial contexts without a ServerService.
export const inFlightProcedureMiddleware = os
  .$context<{ serverService?: Pick<ServerService, "isShuttingDown"> }>()
  .middleware(async ({ context, path, next }) => {
    return await trackInFlightProcedure(
      path,
      () => !context.serverService?.isShuttingDown(),
      async () => next()
    );
  });
