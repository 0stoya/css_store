export class PunchOutBodyTooLargeError extends Error {
  constructor() {
    super("PunchOut request body is too large.");
    this.name = "PunchOutBodyTooLargeError";
  }
}

export async function readBoundedTextBody(
  request: { body?: ReadableStream<Uint8Array> | null; text(): Promise<string> },
  maxBytes: number,
) {
  if (!request.body) {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > maxBytes) throw new PunchOutBodyTooLargeError();
    return body;
  }

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) throw new PunchOutBodyTooLargeError();
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total).toString("utf8");
}
