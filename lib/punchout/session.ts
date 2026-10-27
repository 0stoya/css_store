import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { PunchOutConfig, PunchOutProfile } from "@/lib/punchout/config";
import type { ValidatedPunchOutSetup } from "@/lib/punchout/security";

export type PunchOutSessionStatus = "CREATED" | "ACTIVE" | "RETURNED" | "EXPIRED";
export type PunchOutSession = {
  id: string; profileId: string; payloadId: string; buyerCookie: string;
  browserFormPost: string; buyerIdentity: string; customerId: number;
  companyId: number; storeCode: string; createdAt: number; expiresAt: number;
  entryConsumedAt: number | null; returnedAt: number | null; status: PunchOutSessionStatus;
};
export class PunchOutReplayError extends Error {
  constructor() { super("PunchOut setup request was replayed."); this.name = "PunchOutReplayError"; }
}
export class PunchOutSessionError extends Error {
  constructor(message: string) { super(message); this.name = "PunchOutSessionError"; }
}
const tokenHash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
function toSession(row: Record<string, unknown>): PunchOutSession {
  return {
    id: String(row.id), profileId: String(row.profile_id),
    payloadId: String(row.payload_id), buyerCookie: String(row.buyer_cookie),
    browserFormPost: String(row.browser_form_post), buyerIdentity: String(row.buyer_identity),
    customerId: Number(row.customer_id), companyId: Number(row.company_id),
    storeCode: String(row.store_code), createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
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
      "id TEXT PRIMARY KEY, profile_id TEXT NOT NULL,",
      "entry_token_hash TEXT NOT NULL UNIQUE, browser_token_hash TEXT UNIQUE,",
      "payload_id TEXT NOT NULL, buyer_cookie TEXT NOT NULL, browser_form_post TEXT NOT NULL,",
      "buyer_identity TEXT NOT NULL, customer_id INTEGER NOT NULL, company_id INTEGER NOT NULL,",
      "store_code TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, purge_at INTEGER NOT NULL,",
      "entry_consumed_at INTEGER, returned_at INTEGER,",
      "status TEXT NOT NULL CHECK (status IN ('CREATED','ACTIVE','RETURNED','EXPIRED'))",
      ")",
    ].join(" "));
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS punchout_profile_payload ON punchout_session(profile_id, payload_id)");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS punchout_active_customer ON punchout_session(customer_id) WHERE status IN ('CREATED','ACTIVE')");
    this.db.exec("CREATE INDEX IF NOT EXISTS punchout_session_purge ON punchout_session(purge_at)");
  }
  private cleanup(nowMs: number) {
    this.db.prepare("UPDATE punchout_session SET status='EXPIRED' WHERE status IN ('CREATED','ACTIVE') AND expires_at<=?").run(nowMs);
    this.db.prepare("DELETE FROM punchout_session WHERE purge_at<=?").run(nowMs);
  }
  create(
    setup: ValidatedPunchOutSetup, profile: PunchOutProfile,
    config: Extract<PunchOutConfig, {enabled: true}>, nowMs = Date.now(),
  ) {
    const entryToken = newToken(), id = randomUUID();
    const expiresAt = nowMs + config.sessionTtlSeconds * 1000;
    const purgeAt = Math.max(expiresAt, nowMs + (config.maxClockSkewSeconds * 2 + 1) * 1000);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.cleanup(nowMs);
      const replay = this.db.prepare("SELECT id FROM punchout_session WHERE profile_id=? AND payload_id=? LIMIT 1")
        .get(profile.id, setup.payloadId);
      if (replay) throw new PunchOutReplayError();
      const query = this.db.prepare("SELECT id FROM punchout_session WHERE customer_id=? AND status IN ('CREATED','ACTIVE') LIMIT 1");
      const customerId = profile.customerIds.find((principal) => !query.get(principal));
      if (customerId === undefined) throw new PunchOutSessionError("No dedicated PunchOut customer is available.");
      this.db.prepare([
        "INSERT INTO punchout_session (",
        "id,profile_id,entry_token_hash,payload_id,buyer_cookie,browser_form_post,buyer_identity,",
        "customer_id,company_id,store_code,created_at,expires_at,purge_at,status",
        ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'CREATED')",
      ].join(" ")).run(
        id, profile.id, tokenHash(entryToken), setup.payloadId, setup.buyerCookie,
        setup.browserFormPost, setup.from.identity, customerId, profile.companyId,
        profile.storeCode, nowMs, expiresAt, purgeAt,
      );
      this.db.exec("COMMIT");
      return { id, entryToken, customerId, expiresAt };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  consumeEntryToken(entryToken: string, nowMs = Date.now()) {
    const browserToken = newToken();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.cleanup(nowMs);
      const row = this.db.prepare("SELECT * FROM punchout_session WHERE entry_token_hash=? LIMIT 1")
        .get(tokenHash(entryToken)) as Record<string, unknown> | undefined;
      if (!row || row.status !== "CREATED" || row.entry_consumed_at !== null || Number(row.expires_at) <= nowMs) {
        throw new PunchOutSessionError("PunchOut StartPage is unavailable.");
      }
      const changed = this.db.prepare(
        "UPDATE punchout_session SET entry_consumed_at=?,browser_token_hash=?,status='ACTIVE' " +
        "WHERE id=? AND status='CREATED' AND entry_consumed_at IS NULL",
      ).run(nowMs, tokenHash(browserToken), String(row.id));
      if (Number(changed.changes) !== 1) throw new PunchOutSessionError("PunchOut StartPage is unavailable.");
      const current = this.db.prepare("SELECT * FROM punchout_session WHERE id=?").get(String(row.id)) as Record<string, unknown>;
      this.db.exec("COMMIT");
      return { session: toSession(current), browserToken };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  // Read-only lookup to allow dev-only identity checks before consuming the StartPage.
  peekEntry(entryToken: string, nowMs = Date.now()) {
    const row = this.db.prepare(
      "SELECT * FROM punchout_session WHERE entry_token_hash=? AND status='CREATED' AND entry_consumed_at IS NULL AND expires_at>?",
    ).get(tokenHash(entryToken), nowMs) as Record<string, unknown> | undefined;
    return row ? toSession(row) : null;
  }
  getActiveByBrowserToken(browserToken: string, nowMs = Date.now()) {
    this.cleanup(nowMs);
    const row = this.db.prepare(
      "SELECT * FROM punchout_session WHERE browser_token_hash=? AND status='ACTIVE' " +
      "AND returned_at IS NULL AND expires_at>? LIMIT 1",
    ).get(tokenHash(browserToken), nowMs) as Record<string, unknown> | undefined;
    return row ? toSession(row) : null;
  }
  markReturned(browserToken: string, nowMs = Date.now()) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.cleanup(nowMs);
      const row = this.db.prepare(
        "SELECT * FROM punchout_session WHERE browser_token_hash=? AND status='ACTIVE' " +
        "AND returned_at IS NULL AND expires_at>? LIMIT 1",
      ).get(tokenHash(browserToken), nowMs) as Record<string, unknown> | undefined;
      if (!row) throw new PunchOutSessionError("PunchOut session is unavailable.");
      const updated = this.db.prepare(
        "UPDATE punchout_session SET returned_at=?,status='RETURNED' WHERE id=? AND status='ACTIVE' AND returned_at IS NULL",
      ).run(nowMs, String(row.id));
      if (Number(updated.changes) !== 1) throw new PunchOutSessionError("PunchOut session was already returned.");
      this.db.exec("COMMIT");
      return toSession({ ...row, returned_at: nowMs, status: "RETURNED" });
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() { this.db.close(); }
}
