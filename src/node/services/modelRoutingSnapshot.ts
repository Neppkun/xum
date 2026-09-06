import type { ProvidersConfig } from "@/common/config/schemas/providersConfig";
import type { ProvidersConfigMap } from "@/common/orpc/types";

/** Internal turn state. Never persist this snapshot or send its credentials to the renderer. */
export interface ModelRoutingSnapshot {
  readonly providersConfig: ProvidersConfig;
  readonly metadata: ProvidersConfigMap | null;
  readonly codexOauthSelection: { accountId: string; explicit: boolean };
}
