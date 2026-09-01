import { AxiError } from "axi-sdk-js";
import type { ActiveSpace } from "../config.js";
import { nexudusRequest } from "./client.js";

/**
 * Room (resource) fetching + resolution per specs/commands/rooms.md: one
 * `_depth=3` publicresources read backs list, view, and slots — resolution
 * needs the same payload slots needs for the GUID, so nothing is fetched
 * twice.
 */

export interface Resource {
  Id: number;
  UniqueId: string;
  Name: string;
  ResourceTypeName?: string;
  GroupName?: string | null;
  Description?: string | null;
  Allocation?: number | null;
  Visible?: boolean;
  DisplayOrder?: number;
  Price?: number | null;
  PriceFormatted?: string | null;
  MinBookingLength?: number | null;
  MaxBookingLength?: number | null;
  BookInAdvanceLimit?: number | null;
  LateBookingLimit?: number | null;
  LateCancellationLimit?: number | null;
  IntervalLimit?: number | null;
  AllowMultipleBookings?: boolean;
  RequiresConfirmation?: boolean;
  IsAvailable?: boolean;
  AvailableUnits?: number | null;
  [amenity: string]: unknown;
}

interface PublicResourcesResponse {
  Resources?: Array<Partial<Resource>>;
}

/** All visible bookable resources, in display order. */
export async function fetchResources(active: ActiveSpace): Promise<Resource[]> {
  const res = await nexudusRequest<PublicResourcesResponse>(active, "/en/publicresources", {
    query: { _depth: 3 },
  });
  return (res.Resources ?? [])
    .filter((r): r is Resource => typeof r?.Id === "number" && typeof r?.Name === "string")
    .filter((r) => r.Visible !== false)
    .sort((a, b) => (a.DisplayOrder ?? 0) - (b.DisplayOrder ?? 0));
}

/**
 * Resolve a room reference — numeric Id or case-insensitive name substring —
 * against the fetched resource list. An exact (case-insensitive) name match
 * wins outright; otherwise a unique substring match resolves and an ambiguous
 * one fails listing the candidates (exit 2).
 */
export function resolveRoom(resources: Resource[], ref: string): Resource {
  const trimmed = ref.trim();

  if (/^\d+$/.test(trimmed)) {
    const byId = resources.find((r) => r.Id === Number(trimmed));
    if (byId) return byId;
    throw new AxiError(`No room with id ${trimmed}`, "NOT_FOUND", [
      `Known rooms: ${resources.map((r) => `${r.Id} (${r.Name})`).join(", ") || "(none)"}`,
    ]);
  }

  const needle = trimmed.toLowerCase();
  const exact = resources.filter((r) => r.Name.toLowerCase() === needle);
  if (exact.length === 1) return exact[0]!;

  const matches = resources.filter((r) => r.Name.toLowerCase().includes(needle));
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    throw new AxiError(`No room matches "${ref}"`, "NOT_FOUND", [
      `Known rooms: ${resources.map((r) => r.Name).join(", ") || "(none)"}`,
    ]);
  }
  throw new AxiError(`"${ref}" matches ${matches.length} rooms`, "VALIDATION_ERROR", [
    `Candidates: ${matches.map((r) => `${r.Id} (${r.Name})`).join(", ")}`,
    "Use the numeric id or a longer name fragment",
  ]);
}

/** Strip HTML to readable text — Nexudus descriptions carry heavy editor markup. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(br|\/p|\/li|\/ul|\/ol|\/div|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * The amenity flags rendered by `rooms view` — the boolean facility fields on
 * the resource, shown only when true.
 */
const AMENITY_FIELDS: Array<[string, string]> = [
  ["Internet", "internet"],
  ["NaturalLight", "natural light"],
  ["AirConditioning", "air conditioning"],
  ["Heating", "heating"],
  ["WhiteBoard", "whiteboard"],
  ["LargeDisplay", "large display"],
  ["Projector", "projector"],
  ["VideoConferencing", "video conferencing"],
  ["ConferencePhone", "conference phone"],
  ["StandardPhone", "phone"],
  ["StandingDesk", "standing desk"],
  ["QuietZone", "quiet zone"],
  ["Soundproof", "soundproof"],
  ["PrivacyScreen", "privacy screen"],
  ["WirelessCharger", "wireless charger"],
  ["Catering", "catering"],
  ["TeaAndCoffee", "tea & coffee"],
  ["Drinks", "drinks"],
  ["SecureStorage", "secure storage"],
];

export function amenities(resource: Resource): string[] {
  return AMENITY_FIELDS.filter(([field]) => resource[field] === true).map(([, label]) => label);
}

/** The structured rate, when the space populates it (many don't). */
export function rateOf(resource: Resource): string {
  if (resource.PriceFormatted) return resource.PriceFormatted;
  if (typeof resource.Price === "number" && resource.Price > 0) return String(resource.Price);
  return "";
}
