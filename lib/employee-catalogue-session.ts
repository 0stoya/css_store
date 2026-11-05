import { createHmac, timingSafeEqual } from "node:crypto";

export type SelectedEmployee = {
  customerId: number;
  companyId: number;
  employeeId: number;
  name: string;
  createdAt: number;
};

const TTL_MS = 8 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.CSS_STORE_EMPLOYEE_CATALOGUE_SIGNING_KEY || "";
  if (value.length < 32) throw new Error("Employee catalogue session is not configured.");
  return value;
}

export function signEmployeeSelection(input: SelectedEmployee): string {
  if (![input.companyId, input.customerId, input.employeeId].every((v) => Number.isSafeInteger(v) && v > 0)
    || !Number.isSafeInteger(input.createdAt)
    || typeof input.name !== "string" || input.name.length < 1 || input.name.length > 160) {
    throw new Error("Invalid Employee selection.");
  }
  const body = Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + mac;
}

export function readEmployeeSelection(
  cookie: string | undefined,
  customerId: number,
  companyId: number,
  now = Date.now(),
): SelectedEmployee | null {
  if (!cookie || cookie.length > 1024 || !Number.isSafeInteger(customerId) || !Number.isSafeInteger(companyId)) return null;
  const [body, signature, extra] = cookie.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const selection = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SelectedEmployee;
    if (selection.customerId !== customerId || selection.companyId !== companyId
      || !Number.isSafeInteger(selection.employeeId) || selection.employeeId <= 0
      || typeof selection.name !== "string" || selection.name.length > 160
      || !Number.isSafeInteger(selection.createdAt)
      || selection.createdAt > now || now - selection.createdAt > TTL_MS) return null;
    return selection;
  } catch { return null; }
}
