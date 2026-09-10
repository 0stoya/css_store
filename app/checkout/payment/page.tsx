import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import type { CartMoney } from "@/lib/magento/cart";
import { getCheckoutContext } from "@/lib/magento/checkout";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";
import { completeCheckoutAction } from "./actions";

export const metadata = { title: "Payment & review" };

function money(value: CartMoney | null | undefined) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: value.currency }).format(value.value);
}

function lineEmployee(item: {
  css_employee: { employee_name: string } | null;
  css_kit: { employee_name: string } | null;
}) {
  return item.css_employee?.employee_name || item.css_kit?.employee_name || null;
}

function addressText(address: {
  company?: string | null;
  street: string[];
  city: string;
  region?: { code?: string | null; label?: string | null } | null;
  postcode: string;
  country?: { code: string; label: string | null } | null;
}) {
  return [
    address.company,
    ...address.street,
    address.city,
    address.region?.label || address.region?.code,
    address.postcode,
    address.country?.label || address.country?.code,
  ].filter(Boolean).join(", ");
}

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const token = await requireCustomerToken();
  const [ctx, checkout, messages] = await Promise.all([
    getCustomerContext(token),
    getCheckoutContext(token),
    searchParams,
  ]);

  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const cart = checkout.customerCart;
  const capabilities = checkout.css_ordering_capabilities;
  const shippingAddress = cart.shipping_addresses[0] || null;
  const shippingMethod = shippingAddress?.selected_shipping_method || null;
  const methods = cart.available_payment_methods.filter((method) => method.code && method.title);
  const canCheckout = capabilities.authenticated
    && capabilities.company_context
    && capabilities.company_active
    && capabilities.can_checkout;
  const usesCreditOrder = capabilities.can_submit_credit_order;
  const nativeApprovalAllowed = usesCreditOrder || cart.css_purchase_eligibility?.approval_status === "ALLOWED";
  const ready = canCheckout
    && nativeApprovalAllowed
    && cart.total_quantity > 0
    && Boolean(shippingAddress && shippingMethod)
    && methods.length > 0;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name} basketQuantity={cart.total_quantity}/>
    <main className="shell stack">
      <div className="basket-heading">
        <div>
          <p className="eyebrow">Checkout · payment & review</p>
          <h1>Review and submit</h1>
          <p className="muted">Payment methods below come directly from Magento for this authenticated company basket.</p>
        </div>
        <Link className="button secondary" href="/checkout/delivery">Back to delivery</Link>
      </div>

      {messages.error ? <p className="error">{messages.error}</p> : null}
      {messages.notice ? <p className="success">{messages.notice}</p> : null}

      {!cart.total_quantity ? <section className="empty card"><h2>Your basket is empty</h2><p><Link className="button" href="/catalogue">Browse products</Link></p></section> : null}
      {cart.total_quantity > 0 && !canCheckout ? <p className="error">This company is not currently allowed to place this order.</p> : null}
      {cart.total_quantity > 0 && canCheckout && !nativeApprovalAllowed ? <p className="error">Fluid has not authorised this company basket for native order placement, and the credit-order submission path is not currently available.</p> : null}
      {cart.total_quantity > 0 && (!shippingAddress || !shippingMethod) ? <section className="notice"><strong>Delivery is not complete.</strong><p className="muted small">Choose a delivery address and backend-provided shipping method before payment.</p><p><Link className="button secondary" href="/checkout/delivery">Complete delivery</Link></p></section> : null}

      {cart.total_quantity > 0 ? <div className="delivery-layout">
        <div className="stack">
          <section className="card delivery-card">
            <h2>Payment method</h2>
            <p className="muted">Only methods Magento currently exposes for this cart can be selected.</p>
            {methods.length ? <form action={completeCheckoutAction} className="stack">
              <div className="shipping-method-list">
                {methods.map((method) => {
                  const selected = cart.selected_payment_method?.code === method.code;
                  return <label className={`shipping-method ${selected ? "selected" : ""}`} key={method.code}>
                    <div>
                      <strong>{method.title}</strong>
                      <div className="muted small">{method.code}</div>
                    </div>
                    <input type="radio" name="payment_method" value={method.code} defaultChecked={selected} required disabled={!ready}/>
                  </label>;
                })}
              </div>

              <div className="notice">
                <strong>Billing address</strong>
                <p className="muted small">The selected delivery address will also be used as the billing address for this checkout. Saved customer addresses are not modified.</p>
              </div>

              {usesCreditOrder ? <div className="notice">
                <strong>Fluid company credit workflow</strong>
                <p className="muted small">Fluid will make the authoritative approval decision after submission. {capabilities.can_auto_approve_credit_order ? "This user may be eligible for automatic approval, but the backend still decides the result." : "The order may be held for approval according to the company workflow."}</p>
                {cart.css_purchase_eligibility?.approval_status ? <p className="muted small">Current backend cart approval state: {cart.css_purchase_eligibility.approval_status}</p> : null}
              </div> : <div className="notice">
                <strong>Native Magento checkout</strong>
                <p className="muted small">This order will be submitted through Magento&apos;s standard placeOrder mutation only when Fluid&apos;s current cart approval state is ALLOWED.</p>
              </div>}

              <button className="button" type="submit" disabled={!ready}>Submit order</button>
              <p className="muted small">The cart and company capabilities are re-checked on the server immediately before order submission.</p>
            </form> : <p className="error">Magento has not returned an available payment method for this basket.</p>}
          </section>
        </div>

        <aside className="stack">
          <section className="card delivery-card">
            <h2>Final basket review</h2>
            <div className="checkout-line-list">
              {cart.itemsV2.items.map((item) => {
                const sku = item.configured_variant?.sku || item.product.sku;
                const employee = lineEmployee(item);
                return <div className="checkout-line" key={item.uid}>
                  <div>
                    <strong>{item.product.name}</strong>
                    <div className="muted small">{sku} · Qty {item.quantity}</div>
                    {item.configurable_options?.length ? <div className="muted small">{item.configurable_options.map((option) => `${option.option_label}: ${option.value_label}`).join(" · ")}</div> : null}
                    {item.css_kit ? <div className="badge">Grouped/configurable item</div> : item.configured_variant ? <div className="badge">Configurable item</div> : null}
                    {employee ? <div className="muted small">Employee: {employee}</div> : null}
                  </div>
                </div>;
              })}
            </div>
          </section>

          <section className="card delivery-card basket-totals">
            <h2>Order summary</h2>
            <dl>
              <div><dt>Subtotal ex VAT</dt><dd>{money(cart.prices?.subtotal_excluding_tax)}</dd></div>
              <div className="basket-grand-total"><dt>Grand total</dt><dd>{money(cart.prices?.grand_total)}</dd></div>
            </dl>
          </section>

          {shippingAddress ? <section className="card delivery-card">
            <h2>Delivery</h2>
            <p><strong>{shippingAddress.firstname} {shippingAddress.lastname}</strong></p>
            <p className="muted">{addressText(shippingAddress)}</p>
            {shippingMethod ? <p><span className="badge">{shippingMethod.carrier_title || shippingMethod.carrier_code} · {shippingMethod.method_title || shippingMethod.method_code}</span></p> : <p className="error">No delivery method selected.</p>}
          </section> : null}
        </aside>
      </div> : null}
    </main>
  </>;
}
