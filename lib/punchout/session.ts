import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { EnabledPunchOutConfig } from "@/lib/punchout/config";
import type { ValidatedPunchOutSetup } from "@/lib/punchout/security";

export type PunchOutSessionStatus = "CREATED" | "ACTIVE" | "RETURNED";
export type PunchOutSession = {
  id: string; payloadId: string; buyerCookie: string; browserFormPost: string; buyerIdentity: string;
  customerId: number; companyId: number; storeCode: string; createdAt: number; expiresAt: number;
  entryConsumedAt: number | null; returnedAt: number | null; status: PunchOutSessionStatus;
};
export class PunchOutReplayError extends Error {
  constructor() { super("PunchOut payloadID has already been used."); this.name = "PunchOutReplayError"; }
}
export class PunchOutSessionError extends Error {
  constructor(message: string) { super(message); this.name = "PunchOutSessionError"; }
}
function newToken() { return randomBytes(32).toString("base64url"); }
function tokenHash(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function rowToSession(row: Record<string, unknown>): PunchOutSession {
  return {
    id: String(row.id), payloadId: String(row.payload_id), buyerCookie: String(row.buyer_cookie),
    browserFormPost: String(row.browser_form_post), buyerIdentity: String(row.buyer_identity),
    customerId: Number(row.customer_id), companyId: Number(row.company_id), storeCode: String(row.store_code),
    createdAt: Number(row.created_at), expiresAt: Number(row.expires_at),
    entryConsumedAt: row.entry_consumed_at === null ? null : Number(row.entry_consumed_at),
    returnedAt: row.returned_at === null ? null : Number(row.returned_at),
    status: String(row.status) as PunchOutSessionStatus,
  };
}

export class PunchOutSessionStore {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec([
      "CREATE TABLE IF NOT EXISTS punchout_session (",
      "id TEXT PRIMARY KEY, entry_token_hash TEXT NOT NULL UNIQUE, browser_token_hash TEXT UNIQUE,",
      "payload_id TEXT NOT NULL UNIQUE, buyer_cookie TEXT NOT NULL, browser_form_post TEXT NOT NULL,",
      "buyer_identity TEXT NOT NULL, customer_id INTEGER NOT NULL, company_id INTEGER NOT NULL,",
      "store_code TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,",
      "entry_consumed_at INTEGER, returned_at INTEGER,",
      "status TEXT NOT NULL CHECK (status IN ('CREATED', 'ACTIVE', 'RETURNED'))",
      ")",
    ].join(" "));
    this.db.exec("CREATE INDEX IF NOT EXISTS punchout_session_expires_at ON punchout_session(expires_at)");
  }

  create(setup: ValidatedPunchOutSetup, config: EnabledPunchOutConfig, nowMs = Date.now()) {
    this.db.prepare("DELETE FROM punchout_session WHERE expires_at < ?").run(nowMs);
    const id = randomUUID();
    const entryToken = newToken();
    const expiresAt = nowMs + config.sessionTtlSeconds * 1000;
    try {
      this.db.prepare([
        "INSERT INTO punchout_session (",
        "id, entry_token_hash, payload_id, buyer_cookie, browser_form_post, buyer_identity,",
        "customer_id, company_id, store_code, created_at, expires_at, status",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED')",
      ].join(" ")).run(
        id, tokenHash(entryToken), setup.payloadId, setup.buyerCookie, setup.browserFormPost,
        setup.from.identity, config.magentoCustomerId, config.companyId, config.storeCode, nowMs, expiresAt,
      );
    } catch (error) {
      const existing = this.db.prepare("SELECT id FROM punchout_session WHERE payload_id = ? LIMIT 1").get(setup.payloadId);
      if (existing) throw new PunchOutReplayError();
      throw error;
    }
    return { id, entryToken, expiresAt };
  }

  consumeEntryToken(entryToken: string, nowMs = Date.now()) {
    const browserToken = newToken();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT * FROM punchout_session WHERE entry_token_hash = ? LIMIT 1")
        .get(tokenHash(entryToken)) as Record<string, unknown> | undefined;
      if (!row || String(row.status) !== "CREATED" || row.entry_consumed_at !== null || Number(row.expires_at) <= nowMs) {
        throw new PunchOutSessionError("PunchOut StartPage token is invalid or expired.");
      }
      const result = this.db.prepare(
        "UPDATE punchout_session SET entry_consumed_at = ?, browser_token_hash = ?, status = 'ACTIVE' " +
        "WHERE id = ? AND status = 'CREATED' AND entry_consumed_at IS NULL",
      ).run(nowMs, tokenHash(browserToken), String(row.id));
      if (Number(result.changes) !== 1) throw new PunchOutSessionError("PunchOut StartPage token is invalid or expired.");
      const updated = this.db.prepare("SELECT * FROM punchout_session WHERE id = ?").get(String(row.id)) as Record<string, unknown>;
      this.db.exec("COMMIT");
      return { session: rowToSession(updated), browserToken };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getActiveByBrowserToken(browserToken: string, nowMs = Date.now()) {
    const row = this.db.prepare(
      "SELECT * FROM punchout_session WHERE browser_token_hash = ? AND status = 'ACTIVE' " +
      "AND returned_at IS NULL AND expires_at > ? LIMIT 1",
    ).get(tokenHash(browserToken), nowMs) as Record<string, unknown> | undefined;
    return row ? rowToSession(row) : null;
  }

  markReturned(browserToken: string, nowMs = Date.now()) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT * FROM punchout_session WHERE browser_token_hash = ? LIMIT 1")
        .get(tokenHash(browserToken)) as Record<string, unknown> | undefined;
      if (!row || String(row.status) !== "ACTIVE" || row.returned_at !== null || Number(row.expires_at) <= nowMs) {
        throw new PunchOutSessionError("PunchOut session is invalid, expired or already returned.");
      }
      const result = this.db.prepare(
        "UPDATE punchout_session SET returned_at = ?, status = 'RETURNED' WHERE id = ? AND status = 'ACTIVE' AND returned_at IS NULL",
      ).run(nowMs, String(row.id));
      if (Number(result.changes) !== 1) throw new PunchOutSessionError("PunchOut session is invalid, expired or already returned.");
      const updated = this.db.prepare("SELECT * FROM punchout_session WHERE id = ?").get(String(row.id)) as Record<string, unknown>;
      this.db.exec("COMMIT");
      return rowToSession(updated);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() { this.db.close(); }
}
