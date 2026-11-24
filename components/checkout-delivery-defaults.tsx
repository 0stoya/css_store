"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { applyCheckoutDefaultsAction } from "@/app/checkout/delivery/defaults";

function ApplyButton() {
  const { pending } = useFormStatus();
  return <button className="button secondary" type="submit" disabled={pending}>
    {pending ? "Preparing delivery…" : "Apply delivery defaults"}
  </button>;
}

export function CheckoutDeliveryDefaults({ cartId, companyId, customerId }: {
  cartId: string;
  companyId: number;
  customerId: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !form.current) return;
    started.current = true;
    form.current.requestSubmit();
  }, []);
  return <section className="card delivery-card" aria-label="Preparing delivery">
    <h2>Preparing delivery</h2>
    <p className="muted small">Applying your available delivery defaults.</p>
    <form ref={form} action={applyCheckoutDefaultsAction}>
      <input type="hidden" name="cart_id" value={cartId}/>
      <input type="hidden" name="company_id" value={companyId}/>
      <input type="hidden" name="customer_id" value={customerId}/>
      <ApplyButton/>
    </form>
  </section>;
}
