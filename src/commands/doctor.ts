import { resolveActiveSpace, type ActiveSpace } from "../config.js";
import { DOCTOR_FLAGS, parseFlags, str } from "../flags.js";
import { nexudusRequest } from "../nexudus/client.js";
import { joinBlocks, renderList, renderObject } from "../output/index.js";
import { hookDoctorCheck } from "./setup.js";

/** `doctor` — five ordered checks; see `specs/commands/auth.md#doctor`. */

interface Check {
  check: string;
  status: "ok" | "fail" | "skipped";
  detail: string;
}

const CHECK_SCHEMA = [
  { name: "check", extract: (i: Record<string, unknown>) => i.check },
  { name: "status", extract: (i: Record<string, unknown>) => i.status },
  { name: "detail", extract: (i: Record<string, unknown>) => i.detail },
];

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function finish(checks: Check[]): string {
  const healthy = !checks.some((c) => c.status === "fail");
  if (!healthy) process.exitCode = 1;
  return joinBlocks(
    renderObject({ healthy }),
    renderList("checks", checks as unknown as Array<Record<string, unknown>>, CHECK_SCHEMA),
  );
}

export async function doctorCommand(args: string[]): Promise<string> {
  const parsed = parseFlags("doctor", args, DOCTOR_FLAGS);

  const checks: Check[] = [];

  // 1. credentials
  let active: ActiveSpace;
  try {
    active = resolveActiveSpace({ spaceFlag: str(parsed, "--space") });
  } catch (err) {
    checks.push({ check: "credentials", status: "fail", detail: errMessage(err) });
    checks.push({ check: "token", status: "skipped", detail: "no credentials" });
    checks.push({ check: "profile cache", status: "skipped", detail: "no credentials" });
    checks.push({ check: "resources read", status: "skipped", detail: "no credentials" });
    checks.push(hookDoctorCheck());
    return finish(checks);
  }
  checks.push({
    check: "credentials",
    status: "ok",
    detail: `space ${active.space} (source: ${active.source})`,
  });

  // 2. token (exercises the refresh path implicitly on a stale token)
  const before = active.stored?.access_token;
  try {
    const started = Date.now();
    await nexudusRequest(active, "/en/profile", { query: { _resource: "Coworker" } });
    const refreshed = before !== undefined && active.stored?.access_token !== before;
    checks.push({
      check: "token",
      status: "ok",
      detail: `profile read succeeded in ${Date.now() - started}ms${refreshed ? " (access token was refreshed)" : ""}`,
    });
  } catch (err) {
    checks.push({ check: "token", status: "fail", detail: errMessage(err) });
    checks.push({ check: "profile cache", status: "skipped", detail: "token check failed" });
    checks.push({ check: "resources read", status: "skipped", detail: "token check failed" });
    checks.push(hookDoctorCheck());
    return finish(checks);
  }

  // 3. profile cache
  const cache = active.stored?.profile_cache;
  if (!cache || !cache.coworker_id) {
    checks.push({
      check: "profile cache",
      status: "fail",
      detail: `no cached coworker identity — run \`nexudus-axi auth login --space ${active.space} ...\` to bootstrap it`,
    });
  } else if (!cache.timezone) {
    checks.push({
      check: "profile cache",
      status: "fail",
      detail: `coworker + business cached, but the space timezone is unset — wall-clock math is using the machine zone; run \`nexudus-axi auth login --space ${active.space} --timezone <iana> ...\``,
    });
  } else {
    checks.push({
      check: "profile cache",
      status: "ok",
      detail: `${cache.coworker_name} @ ${cache.business_name} (${cache.timezone})`,
    });
  }

  // 4. resources read — the canary for portal-contract drift
  try {
    const res = await nexudusRequest<{ Resources?: unknown[] }>(active, "/en/publicresources", {
      query: { _depth: 3 },
    });
    const count = Array.isArray(res.Resources) ? res.Resources.length : 0;
    if (count > 0) {
      checks.push({ check: "resources read", status: "ok", detail: `${count} bookable resources visible` });
    } else {
      checks.push({
        check: "resources read",
        status: "fail",
        detail: "publicresources returned no resources — portal contract drift, or this membership can't book",
      });
    }
  } catch (err) {
    checks.push({ check: "resources read", status: "fail", detail: errMessage(err) });
  }

  // 5. hooks
  checks.push(hookDoctorCheck());

  return finish(checks);
}
