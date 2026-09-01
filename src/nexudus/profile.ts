import { AxiError } from "axi-sdk-js";
import type { ActiveSpace, ProfileCache } from "../config.js";
import { nexudusRequest } from "./client.js";

/**
 * Profile bootstrap per specs/api/coworker.md (field paths verified live).
 * Fetches the coworker record and the business list, and assembles the
 * ProfileCache every other command scopes against.
 */

interface CoworkerResource {
  Id?: number;
  FullName?: string;
  Email?: string;
  HomeSpaceId?: number;
  InvoicingBusinessId?: number;
  CanMakeBookings?: boolean;
}

interface BusinessRow {
  Id?: number;
  Name?: string;
}

export async function fetchProfile(active: ActiveSpace, timezone?: string): Promise<ProfileCache> {
  const coworker = await nexudusRequest<CoworkerResource>(active, "/en/profile", {
    query: { _resource: "Coworker" },
  });

  if (typeof coworker.Id !== "number") {
    throw new AxiError(
      "The profile response carried no coworker id — this login may not be a member of the space",
      "UNEXPECTED_RESPONSE",
      ["Confirm the account is an active member of this space's portal"],
    );
  }

  const businessId = coworker.HomeSpaceId ?? coworker.InvoicingBusinessId;

  let businessName: string | undefined;
  if (businessId !== undefined) {
    const businesses = await nexudusRequest<BusinessRow[] | Record<string, unknown>>(
      active,
      "/en/business/all",
      { query: { _depth: 1, includeRoot: true } },
    ).catch(() => undefined);
    if (Array.isArray(businesses)) {
      businessName =
        businesses.find((b) => b.Id === businessId)?.Name ?? businesses[0]?.Name;
    }
  }

  const cache: ProfileCache = {
    coworker_id: coworker.Id,
    coworker_name: coworker.FullName ?? "",
    email: coworker.Email ?? "",
    business_id: businessId ?? 0,
    business_name: businessName ?? "",
    cached_at: new Date().toISOString(),
  };
  if (timezone) cache.timezone = timezone;
  return cache;
}
