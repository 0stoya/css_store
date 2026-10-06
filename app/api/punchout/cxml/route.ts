import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildPunchOutSetupResponse,
  buildPunchOutStatusResponse,
  parsePunchOutSetupRequest,
  PunchOutCxmlError,
} from "@/lib/punchout/cxml";
import { getPunchOutConfig, type PunchOutConfig } from "@/lib/punchout/config";
import {
  PunchOutBodyTooLargeError,
  readBoundedTextBody,
} from "@/lib/punchout/http";
import {
  PunchOutReplayError,
  PunchOutSessionError,
  PunchOutSessionStore,
} from "@/lib/punchout/session";
import {
  PunchOutValidationError,
  validatePunchOutSetup,
} from "@/lib/punchout/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCEPTED_CONTENT_TYPES = new Set([
  "application/cxml",
  "application/xml",
  "text/xml",
]);

function responsePayloadId() {
  return randomUUID() + "@css-store";
}

function xmlResponse(xml: string, status: number) {
  return new NextResponse(xml, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function statusResponse(status: number, text: string, message: string) {
  return xmlResponse(buildPunchOutStatusResponse({
    payloadId: responsePayloadId(),
    timestamp: new Date().toISOString(),
    code: status,
    text,
    message,
  }), status);
}

export async function POST(request: NextRequest) {
  let config: PunchOutConfig;
  try {
    config = getPunchOutConfig();
  } catch {
    return statusResponse(503, "Service Unavailable", "PunchOut is unavailable.");
  }

  if (!config.enabled) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
    return statusResponse(415, "Unsupported Media Type", "A cXML XML content type is required.");
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > config.maxBodyBytes) {
    return statusResponse(413, "Payload Too Large", "The cXML request is too large.");
  }

  try {
    const body = await readBoundedTextBody(request, config.maxBodyBytes);
    const setup = validatePunchOutSetup(
      parsePunchOutSetupRequest(body, config.maxBodyBytes),
      config,
    );

    const store = new PunchOutSessionStore(config.sessionDbPath);
    let created: ReturnType<PunchOutSessionStore["create"]>;
    try {
      created = store.create(setup, config);
    } finally {
      store.close();
    }

    const startPage = new URL(
      "/punchout/session/" + encodeURIComponent(created.entryToken),
      config.storeOrigin,
    ).toString();

    return xmlResponse(buildPunchOutSetupResponse({
      payloadId: responsePayloadId(),
      timestamp: new Date().toISOString(),
      startPageUrl: startPage,
      version: setup.version,
    }), 200);
  } catch (error) {
    if (error instanceof PunchOutBodyTooLargeError) {
      return statusResponse(413, "Payload Too Large", "The cXML request is too large.");
    }
    if (error instanceof PunchOutReplayError || error instanceof PunchOutSessionError) {
      return statusResponse(409, "Conflict", "A PunchOut session cannot be created for this request.");
    }
    if (error instanceof PunchOutCxmlError || error instanceof PunchOutValidationError) {
      return statusResponse(400, "Bad Request", "The PunchOut request was not accepted.");
    }
    return statusResponse(503, "Service Unavailable", "PunchOut is temporarily unavailable.");
  }
}
