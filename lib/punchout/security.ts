import { createHash, timingSafeEqual } from "node:crypto";
import type { PunchOutSetupRequest } from "@/lib/punchout/cxml";
import type { EnabledPunchOutConfig, PunchOutCredential } from "@/lib/punchout/config";

export class PunchOutValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PunchOutValidationError"; }
}
function sameCredential(actual: PunchOutCredential, expected: PunchOutCredential) {
  return actual.domain === expected.domain && actual.identity === expected.identity;
}
function secretMatches(actual: string, expected: string) {
  const actualHash = createHash("sha256").update(actual, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualHash, expectedHash);
}
function validTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function validateBrowserFormPost(value: string, allowedHosts: string[]) {
  const callback = value.trim();
  let url: URL;
  try { url = new URL(callback); }
  catch { throw new PunchOutValidationError("BrowserFormPost URL is invalid."); }
  if (url.protocol !== "https:") throw new PunchOutValidationError("BrowserFormPost URL must use HTTPS.");
  if (url.username || url.password || url.hash) throw new PunchOutValidationError("BrowserFormPost URL contains unsupported URL components.");
  if (url.port && url.port !== "443") throw new PunchOutValidationError("BrowserFormPost URL must use the standard HTTPS port.");
  if (!allowedHosts.includes(url.hostname.toLowerCase())) throw new PunchOutValidationError("BrowserFormPost host is not allowed.");
  return callback;
}

export type ValidatedPunchOutSetup = PunchOutSetupRequest & { browserFormPost: string };

export function validatePunchOutSetup(
  request: PunchOutSetupRequest,
  config: EnabledPunchOutConfig,
  nowMs = Date.now(),
): ValidatedPunchOutSetup {
  if (request.operation !== "create") throw new PunchOutValidationError("Only PunchOutSetupRequest operation=create is supported.");
  if (!sameCredential(request.from, config.credentials.from)) throw new PunchOutValidationError("PunchOut From credential is not recognised.");
  if (!sameCredential(request.to, config.credentials.to)) throw new PunchOutValidationError("PunchOut To credential is not recognised.");
  if (!sameCredential(request.sender, config.credentials.sender)) throw new PunchOutValidationError("PunchOut Sender credential is not recognised.");
  if (!secretMatches(request.sender.sharedSecret, config.sharedSecret)) throw new PunchOutValidationError("PunchOut Sender credential is not recognised.");
  if (!request.payloadId || request.payloadId.length > 512 || /[\r\n]/.test(request.payloadId)) throw new PunchOutValidationError("PunchOut payloadID is invalid.");
  if (!request.buyerCookie || request.buyerCookie.length > 4096) throw new PunchOutValidationError("PunchOut BuyerCookie is invalid.");

  const timestampMs = validTimestamp(request.timestamp);
  if (timestampMs === null) throw new PunchOutValidationError("PunchOut timestamp is invalid.");
  if (Math.abs(nowMs - timestampMs) > config.maxClockSkewSeconds * 1000) {
    throw new PunchOutValidationError("PunchOut timestamp is outside the accepted clock window.");
  }
  return { ...request, browserFormPost: validateBrowserFormPost(request.browserFormPost, config.allowedReturnHosts) };
}
