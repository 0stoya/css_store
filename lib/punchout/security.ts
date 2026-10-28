import { createHash, timingSafeEqual } from "node:crypto";
import type { PunchOutSetupRequest } from "@/lib/punchout/cxml";
import type { PunchOutConfig, PunchOutCredential, PunchOutProfile } from "@/lib/punchout/config";

export class PunchOutValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PunchOutValidationError"; }
}
function sameCredential(actual: PunchOutCredential, expected: PunchOutCredential) {
  return actual.domain === expected.domain && actual.identity === expected.identity;
}
function secretMatches(actual: string, expected: string) {
  return timingSafeEqual(
    createHash("sha256").update(actual, "utf8").digest(),
    createHash("sha256").update(expected, "utf8").digest(),
  );
}
export function validateBrowserFormPost(value: string, allowedHosts: string[]) {
  const callback = value.trim();
  let url: URL;
  try { url = new URL(callback); }
  catch { throw new PunchOutValidationError("Invalid return URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      (url.port && url.port !== "443") || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new PunchOutValidationError("Untrusted PunchOut return URL.");
  }
  return callback;
}
export type ValidatedPunchOutSetup = PunchOutSetupRequest & { browserFormPost: string };
export function validatePunchOutSetup(
  request: PunchOutSetupRequest,
  config: Extract<PunchOutConfig, {enabled: true}>,
  nowMs = Date.now(),
): { profile: PunchOutProfile; setup: ValidatedPunchOutSetup } {
  const candidate = config.profiles.find((p) =>
    sameCredential(request.from, p.credentials.from) &&
    sameCredential(request.to, p.credentials.to) &&
    sameCredential(request.sender, p.credentials.sender));
  // Only after exact Header identity matching may the one partner secret be checked.
  if (!candidate || !secretMatches(request.sender.sharedSecret, candidate.sharedSecret)) {
    throw new PunchOutValidationError("Unrecognised PunchOut partner.");
  }
  if (request.operation !== "create" || !request.payloadId || request.payloadId.length > 512 ||
      /[\r\n]/.test(request.payloadId) || request.buyerCookie.length > 4096 || !request.buyerCookie) {
    throw new PunchOutValidationError("Invalid PunchOut request.");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(request.timestamp)) {
    throw new PunchOutValidationError("Invalid timestamp.");
  }
  const timestamp = Date.parse(request.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(timestamp - nowMs) > config.maxClockSkewSeconds * 1000) {
    throw new PunchOutValidationError("PunchOut timestamp is outside accepted window.");
  }
  return {
    profile: candidate,
    setup: {
      ...request,
      browserFormPost: validateBrowserFormPost(request.browserFormPost, candidate.allowedReturnHosts),
    },
  };
}
