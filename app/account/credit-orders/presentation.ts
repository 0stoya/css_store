const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function readableCreditOrderStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCreditOrderDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!match) return value;

  const [, year, month, day, hour, minute] = match;
  const monthName = MONTHS[Math.max(0, Math.min(11, Number(month) - 1))];
  return `${Number(day)} ${monthName} ${year}, ${hour}:${minute}`;
}

export function creditOrderMethodLabel(value: string | null | undefined, kind: "payment" | "shipping") {
  if (!value) return "—";

  const normalised = value.trim().toLowerCase();
  const known: Record<string, string> = {
    purchaseorder: "Purchase order",
    banktransfer: "Bank transfer",
    checkmo: "Cheque / money order",
    cashondelivery: "Cash on delivery",
    free: "Free delivery",
    flatrate_flatrate: "Standard delivery",
    ogldelivery_ogldelivery: "OGL delivery",
    ogldelivery: "OGL delivery",
  };

  if (known[normalised]) return known[normalised];

  const parts = normalised.split("_").filter(Boolean);
  const collapsed = parts.length === 2 && parts[0] === parts[1] ? parts[0] : normalised;
  const label = collapsed
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  if (label.toLowerCase() === "ogldelivery") return "OGL delivery";
  return label || (kind === "payment" ? "Payment method" : "Delivery method");
}

export function creditOrderActorLabel(actor: number | null, currentUser: number | null) {
  if (!actor) return "System";
  return actor === currentUser ? "You" : "Another company user";
}

type ActivityPresentation = {
  title: string;
  detail: string | null;
};

function parseActivityPayload(message: string | null | undefined) {
  if (!message) return null;
  try {
    const parsed = JSON.parse(message) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nestedString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

export function creditOrderActivityPresentation(activityType: string | null | undefined, message: string | null | undefined): ActivityPresentation {
  const type = String(activityType || "").toLowerCase();
  const payload = parseActivityPayload(message);
  const params = payload?.params;
  const linkedOrder = nestedString(params, "order_increment_id") || nestedString(params, "order_number");

  const known: Record<string, ActivityPresentation> = {
    submit: { title: "Submitted", detail: "Credit order submitted for processing." },
    auto_approve: { title: "Automatically approved", detail: "The order met the configured approval rules." },
    approve: { title: "Approved", detail: "Credit order approved." },
    reject: { title: "Rejected", detail: "Credit order rejected." },
    cancel: { title: "Cancelled", detail: "Credit order cancelled." },
    place_order: { title: "Sales order created", detail: linkedOrder ? `Sales order ${linkedOrder} was created.` : "The approved credit order was converted to a sales order." },
    add_comment: { title: "Comment added", detail: null },
    comment: { title: "Comment added", detail: null },
    payment_details: { title: "Payment details updated", detail: "Payment details were updated for this credit order." },
    purchase_order_number: { title: "Purchase order number updated", detail: "The purchase order reference was updated." },
    set_purchase_order_number: { title: "Purchase order number updated", detail: "The purchase order reference was updated." },
  };

  if (known[type]) return known[type];

  const looksTechnical = Boolean(message && /^[\s]*[\[{]/.test(message));
  return {
    title: activityType ? readableCreditOrderStatus(activityType) : "Order updated",
    detail: message && !looksTechnical ? message : null,
  };
}
