/** Display the backend result; do not reproduce approval rules or allowance arithmetic. */
export type PurchaseAllowanceDecision = {
  logical_product_id: number;
  has_active_restriction: boolean;
  allowed_quantity: number;
  purchased_quantity: number;
  remaining_quantity: number;
  requested_quantity: number;
  status: string;
  reason: string | null;
};

export type PurchaseAllowanceEligibility = {
  approval_status: string;
  items: PurchaseAllowanceDecision[];
};

type LabelItem = {
  product: { allowance_product_id?: number | null; name: string };
  css_kit: { parent_kit_product_id: number } | null;
};

export function purchaseAllowanceView(
  eligibility: PurchaseAllowanceEligibility | null | undefined,
  items: LabelItem[],
) {
  if (!eligibility) return null;
  const known = eligibility.approval_status === "ALLOWED" || eligibility.approval_status === "APPROVAL_REQUIRED";
  if (!known) return {
    requiresApproval: false,
    unavailable: true,
    rows: [],
  };

  const requiresApproval = eligibility.approval_status === "APPROVAL_REQUIRED";
  const names = new Map<number, Set<string>>();
  for (const item of items) {
    // Group identity, not employee identity or SKU, determines the shared allowance.
    const id = item.css_kit?.parent_kit_product_id || item.product.allowance_product_id;
    if (!id || !item.product.name.trim()) continue;
    const labels = names.get(id) ?? new Set<string>();
    labels.add(item.product.name.trim());
    names.set(id, labels);
  }

  const seen = new Set<number>();
  const rows = (eligibility.items ?? []).filter((decision) => {
    if (!decision.has_active_restriction || !Number.isInteger(decision.logical_product_id) || decision.logical_product_id < 1) return false;
    if (seen.has(decision.logical_product_id)) return false;
    const quantities = [decision.allowed_quantity, decision.purchased_quantity, decision.remaining_quantity, decision.requested_quantity];
    if (!quantities.every((value) => Number.isFinite(value) && value >= 0)) return false;
    seen.add(decision.logical_product_id);
    return true;
  }).map((decision) => ({
    ...decision,
    label: [...(names.get(decision.logical_product_id) ?? [])].join(" / ") || `Product allowance #${decision.logical_product_id}`,
    // Per-product diagnostics do NOT override the company's overall decision.
    showRecordedExcess: requiresApproval && decision.status === "APPROVAL_REQUIRED" && decision.reason === "QUANTITY_LIMIT_EXCEEDED",
  }));

  if (!requiresApproval && rows.length === 0) return null;
  return { requiresApproval, unavailable: false, rows };
}

export function checkoutSubmitLabel(usesCreditOrder: boolean, approvalStatus: string | null | undefined): string {
  if (!usesCreditOrder) return "Place order";
  return approvalStatus === "APPROVAL_REQUIRED" ? "Submit for approval" : "Submit order";
}
