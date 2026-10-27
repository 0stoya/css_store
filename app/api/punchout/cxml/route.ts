import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { parsePunchOutSetupRequest, buildPunchOutSetupResponse, buildPunchOutStatusResponse, PunchOutCxmlError } from "@/lib/punchout/cxml";
import { getPunchOutConfig } from "@/lib/punchout/config";
import { PunchOutBodyTooLargeError, readBoundedTextBody } from "@/lib/punchout/http";
import { PunchOutReplayError, PunchOutSessionError, PunchOutSessionStore } from "@/lib/punchout/session";
import { PunchOutValidationError, validatePunchOutSetup } from "@/lib/punchout/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const TYPES = new Set(["application/cxml", "application/xml", "text/xml"]);
const payloadId = () => randomUUID() + "@css-store";
function xmlResponse(xml: string, status: number) {
  return new NextResponse(xml, {status, headers: {
    "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  }});
}
function errorResponse(status: number, text: string) {
  return xmlResponse(buildPunchOutStatusResponse({
    payloadId: payloadId(), timestamp: new Date().toISOString(),
    code: status, text, message: "PunchOut request could not be completed.",
  }), status);
}
export async function POST(request: NextRequest) {
  let config;
  try { config = getPunchOutConfig(); } catch { return errorResponse(503, "Unavailable"); }
  if (!config.enabled) return new NextResponse(null, {status: 404, headers: {"Cache-Control": "no-store"}});
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
  if (!TYPES.has(type)) return errorResponse(415, "Unsupported Media Type");
  const length = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > config.maxBodyBytes) return errorResponse(413, "Payload Too Large");
  try {
    const body = await readBoundedTextBody(request, config.maxBodyBytes);
    const { profile, setup } = validatePunchOutSetup(
      parsePunchOutSetupRequest(body, config.maxBodyBytes), config,
    );
    const db = new PunchOutSessionStore(config.sessionDbPath);
    let created;
    try { created = db.create(setup, profile, config); } finally { db.close(); }
    const start = new URL("/punchout/session/" + encodeURIComponent(created.entryToken), config.storeOrigin).toString();
    return xmlResponse(buildPunchOutSetupResponse({
      payloadId: payloadId(), timestamp: new Date().toISOString(),
      version: setup.version, startPageUrl: start,
    }), 200);
  } catch (error) {
    if (error instanceof PunchOutBodyTooLargeError) return errorResponse(413, "Payload Too Large");
    if (error instanceof PunchOutReplayError || error instanceof PunchOutSessionError) return errorResponse(409, "Conflict");
    if (error instanceof PunchOutCxmlError || error instanceof PunchOutValidationError) return errorResponse(400, "Bad Request");
    return errorResponse(503, "Unavailable");
  }
}
