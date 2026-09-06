import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/browser/components/Button/Button";
import { useAPI, type APIClient } from "@/browser/contexts/API";
import { useProjectContext } from "@/browser/contexts/ProjectContext";
import { useProvidersConfig } from "@/browser/hooks/useProvidersConfig";
import type { ProviderConfigInfo } from "@/common/orpc/types";
import type { Result } from "@/common/types/result";
import { getErrorMessage } from "@/common/utils/errors";
import {
  CODEX_OAUTH_DEFAULT_ACCOUNT_ID,
  CODEX_OAUTH_ACCOUNT_LABEL_MAX_LENGTH,
} from "@/common/constants/codexOauthAccounts";

type LoginInput = Parameters<APIClient["codexOauth"]["startDeviceFlow"]>[0];
type Account = NonNullable<ProviderConfigInfo["codexOauthAccounts"]>[number];
interface LoginFlow {
  flowId: string;
  url: string;
  userCode?: string;
  cancel: () => Promise<void>;
}

const inputClassName =
  "bg-background border-border-light text-foreground w-full min-w-0 rounded border px-2 py-1.5 text-xs";

function AccountSelect(props: {
  label: string;
  value: string;
  accounts: Account[];
  defaultLabel?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  // Keep missing selections visible. Selecting another account must require a user action.
  const missing =
    props.value !== "" && !props.accounts.some((account) => account.id === props.value);
  return (
    <label className="text-muted block min-w-0 space-y-1 text-xs">
      <span className="block break-words">{props.label}</span>
      <select
        aria-label={props.label}
        className={inputClassName}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.defaultLabel != null && (
          <option value="">Inherit global default ({props.defaultLabel})</option>
        )}
        {missing && <option value={props.value}>Missing account ({props.value})</option>}
        {props.accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label}
          </option>
        ))}
      </select>
      {missing && (
        <span className="text-warning block">
          The selected account is missing. Select a connected account.
        </span>
      )}
    </label>
  );
}

export function CodexAccounts() {
  const { api } = useAPI();
  const { config, refresh } = useProvidersConfig();
  const { userProjects, refreshProjects } = useProjectContext();
  const [label, setLabel] = useState("");
  const [rename, setRename] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginInProgress, setLoginInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<LoginFlow | null>(null);
  const attemptRef = useRef(0);
  const flowRef = useRef<LoginFlow | null>(null);
  const openai = config?.openai;
  const accounts =
    openai?.codexOauthAccounts ??
    (openai?.codexOauthSet ? [{ id: CODEX_OAUTH_DEFAULT_ACCOUNT_ID, label: "Default" }] : []);
  const defaultId = openai?.codexOauthDefaultAccountId ?? CODEX_OAUTH_DEFAULT_ACCOUNT_ID;
  const defaultLabel =
    accounts.find((account) => account.id === defaultId)?.label ?? `Missing account (${defaultId})`;
  const isDesktop = !!window.api;
  const showBrowser =
    isDesktop || ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const disabled = !api || busy;
  const authEditable =
    accounts.length > 0 && (openai?.apiKeySet === true || !!openai?.apiKeySource);

  // Login owns its server flow. Unmount invalidates late results and cancels the current flow.
  useEffect(
    () => () => {
      attemptRef.current++;
      flowRef.current?.cancel().catch(() => undefined);
    },
    []
  );

  function runAction(operation: Promise<unknown>): void {
    operation.catch((err: unknown) => setError(getErrorMessage(err)));
  }

  async function saveName() {
    if (!api || !rename) return;
    const input = { accountId: rename.id, label: rename.label.trim() };
    if (await mutate(() => api.codexOauth.renameAccount(input))) setRename(null);
  }

  async function refreshState() {
    await Promise.all([refresh(), refreshProjects()]);
  }

  async function mutate(operation: () => Promise<Result<void, string>>) {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (!result.success) {
        setError(result.error);
        return false;
      }
      await refreshState();
      return true;
    } catch (err) {
      setError(getErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function connect(device: boolean, input: LoginInput) {
    if (!api) return;
    const attempt = ++attemptRef.current;
    setLoginInProgress(true);
    setBusy(true);
    setError(null);
    try {
      let nextFlow: LoginFlow;
      if (device || !showBrowser) {
        const result = await api.codexOauth.startDeviceFlow(input);
        if (!result.success) throw new Error(result.error);
        const { flowId, userCode, verifyUrl } = result.data;
        nextFlow = {
          flowId,
          userCode,
          url: verifyUrl,
          cancel: () => api.codexOauth.cancelDeviceFlow({ flowId }),
        };
      } else {
        const result = await api.codexOauth.startDesktopFlow(input);
        if (!result.success) throw new Error(result.error);
        const { flowId, authorizeUrl } = result.data;
        nextFlow = {
          flowId,
          url: authorizeUrl,
          cancel: () => api.codexOauth.cancelDesktopFlow({ flowId }),
        };
      }
      if (attempt !== attemptRef.current) {
        await nextFlow.cancel();
        return;
      }
      flowRef.current = nextFlow;
      setFlow(nextFlow);
      const result =
        nextFlow.userCode != null
          ? await api.codexOauth.waitForDeviceFlow({ flowId: nextFlow.flowId })
          : await api.codexOauth.waitForDesktopFlow({ flowId: nextFlow.flowId });
      if (attempt !== attemptRef.current) return;
      if (!result.success) throw new Error(result.error);
      setLabel("");
      await refreshState();
    } catch (err) {
      if (attempt === attemptRef.current) setError(getErrorMessage(err));
    } finally {
      if (attempt === attemptRef.current) {
        flowRef.current = null;
        setFlow(null);
        setLoginInProgress(false);
        setBusy(false);
      }
    }
  }

  async function cancel() {
    attemptRef.current++;
    try {
      await flowRef.current?.cancel();
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      flowRef.current = null;
      setFlow(null);
      setLoginInProgress(false);
      setBusy(false);
    }
  }

  const loginInput = label.trim() ? { label: label.trim() } : undefined;
  return (
    <section aria-label="ChatGPT (Codex) accounts" className="min-w-0 space-y-3">
      <div>
        <h4 className="text-foreground text-xs font-medium">ChatGPT (Codex) OAuth</h4>
        <p className="text-muted text-xs">{accounts.length > 0 ? "Connected" : "Not connected"}</p>
      </div>
      <ul className="space-y-2">
        {accounts.map((account) => (
          <li
            key={account.id}
            aria-label={account.label}
            className="border-border-light min-w-0 space-y-2 rounded border p-2"
          >
            {rename?.id === account.id ? (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  runAction(saveName());
                }}
              >
                <input
                  autoFocus
                  aria-label="Account name"
                  maxLength={CODEX_OAUTH_ACCOUNT_LABEL_MAX_LENGTH}
                  className={inputClassName}
                  value={rename.label}
                  onChange={(event) => setRename({ ...account, label: event.target.value })}
                />
                <Button type="submit" size="sm" disabled={disabled || !rename.label.trim()}>
                  Save name
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => setRename(null)}
                >
                  Cancel rename
                </Button>
              </form>
            ) : (
              <>
                <p className="text-foreground text-xs font-medium break-words">
                  {account.label}
                  {account.id === defaultId && (
                    <span className="text-muted font-normal"> · Global default</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => runAction(connect(false, { accountId: account.id }))}
                  >
                    Reconnect
                  </Button>
                  {showBrowser && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => runAction(connect(true, { accountId: account.id }))}
                    >
                      Reconnect (Device)
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => setRename(account)}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      api &&
                      runAction(mutate(() => api.codexOauth.disconnect({ accountId: account.id })))
                    }
                  >
                    Disconnect
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          runAction(connect(false, loginInput));
        }}
      >
        <label className="text-muted block space-y-1 text-xs">
          <span>Add account</span>
          <input
            aria-label="New account name"
            maxLength={CODEX_OAUTH_ACCOUNT_LABEL_MAX_LENGTH}
            className={inputClassName}
            placeholder="Account name"
            value={label}
            disabled={disabled}
            onChange={(event) => setLabel(event.target.value)}
            required={accounts.length > 0}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {showBrowser && (
            <Button
              type="submit"
              size="sm"
              disabled={disabled || (accounts.length > 0 && !label.trim())}
            >
              Connect (Browser)
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || (accounts.length > 0 && !label.trim())}
            onClick={() => runAction(connect(true, loginInput))}
          >
            Connect (Device)
          </Button>
        </div>
      </form>
      {busy && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
          <span>
            {flow ? "Waiting for authorization..." : loginInProgress ? "Starting..." : "Saving..."}
          </span>
          {loginInProgress && (
            <Button size="sm" variant="secondary" onClick={() => runAction(cancel())}>
              Cancel
            </Button>
          )}
        </div>
      )}
      {flow && (
        <div className="bg-background-tertiary space-y-2 rounded p-3">
          {flow.userCode && (
            <>
              <p className="text-muted text-xs">Enter this code on the OpenAI verification page:</p>
              <code className="text-foreground text-lg font-bold tracking-widest break-all">
                {flow.userCode}
              </code>
            </>
          )}
          <Button
            size="sm"
            onClick={() => {
              // Device login opens only after this explicit user action.
              window.open(flow.url, "_blank", "noopener");
              runAction(navigator.clipboard.writeText(flow.userCode ?? flow.url));
            }}
          >
            Copy &amp; Open OpenAI
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs break-words">
          {error}
        </p>
      )}
      <AccountSelect
        label="Global default account"
        value={defaultId}
        accounts={accounts}
        disabled={disabled}
        onChange={(accountId) =>
          api && runAction(mutate(() => api.codexOauth.setDefaultAccount({ accountId })))
        }
      />
      <div className="border-border-light space-y-2 border-t pt-3">
        <h4 className="text-foreground text-xs font-medium">Project accounts</h4>
        <p className="text-muted text-xs">
          Project selections override the global default. Missing accounts do not use another
          account.
        </p>
        {Array.from(userProjects, ([projectPath, project]) => (
          <AccountSelect
            key={projectPath}
            label={project.displayName ?? projectPath}
            value={project.codexOauthAccountId ?? ""}
            accounts={accounts}
            defaultLabel={defaultLabel}
            disabled={disabled}
            onChange={(accountId) =>
              api &&
              runAction(
                mutate(() =>
                  api.projects.setCodexOauthAccount({ projectPath, accountId: accountId || null })
                )
              )
            }
          />
        ))}
      </div>
      <label className="text-muted block space-y-1 text-xs">
        <span>Default auth (when both are set)</span>
        <select
          aria-label="Default auth (when both are set)"
          className={inputClassName}
          value={openai?.codexOauthDefaultAuth ?? "oauth"}
          disabled={disabled || !authEditable}
          onChange={(event) => {
            const value = event.target.value;
            return (
              api &&
              runAction(
                mutate(() =>
                  api.providers.setProviderConfig({
                    provider: "openai",
                    keyPath: ["codexOauthDefaultAuth"],
                    value,
                  })
                )
              )
            );
          }}
        >
          <option value="oauth">Use ChatGPT OAuth by default</option>
          <option value="apiKey">Use OpenAI API key by default</option>
        </select>
      </label>
      <p className="text-muted text-xs">
        ChatGPT OAuth costs use API-equivalent estimates. Your plan may include usage or charge
        credits. API keys use OpenAI platform billing.
      </p>
      {!authEditable && (
        <p className="text-muted text-xs">
          Connect ChatGPT OAuth and set an OpenAI API key to change this setting.
        </p>
      )}
    </section>
  );
}
