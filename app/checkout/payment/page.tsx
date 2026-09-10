import Link from "next/link";
import { CheckoutSteps } from "@/components/checkout-steps";
import { SiteHeader } from "@/components/site-header";
import type { CartMoney } from "@/lib/magento/cart";
import { getCheckoutContext } from "@/lib/magento/checkout";
import { getCustomerContext } from "@/lib/magento/context";
import { getEmployeeOrdering } from "@/lib/magento/employee";
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
  const [ctx, checkout, ordering, messages] = await Promise.all([
    getCustomerContext(token),
    getCheckoutContext(token),
    getEmployeeOrdering(token),
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
  const includeEmployee = ordering.usesEmployee && !ordering.multiEmployeeBasket;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name} basketQuantity={cart.total_quantity}/>
    <main className="shell stack">
      <CheckoutSteps current="payment" includeEmployee={includeEmployee}/>

      <div className="basket-heading checkout-heading">
        <div>
          <p className="eyebrow">Checkout</p>
          <h1>Payment & review</h1>
          <p className="muted">Choose your payment method, check the order details and submit when you’re ready.</p>
        </div>
        <Link className="button secondary" href="/checkout/delivery">Back to delivery</Link>
      </div>

      {messages.error ? <p className="error" role="alert">{messages.error}</p> : null}
      {messages.notice ? <p className="success" role="status">{messages.notice}</p> : null}

      {!cart.total_quantity ? <section className="empty card"><h2>Your basket is empty</h2><p><Link className="button" href="/catalogue">Browse products</Link></p></section> : null}
      {cart.total_quantity > 0 && !canCheckout ? <p className="error" role="alert">This company is not currently able to place this order.</p> : null}
      {cart.total_quantity > 0 && canCheckout && !nativeApprovalAllowed ? <p className="error" role="alert">This order is not currently authorised for submission. Review the purchase status in your basket or contact your account administrator.</p> : null}
      {cart.total_quantity > 0 && (!shippingAddress || !shippingMethod) ? <section className="notice"><strong>Delivery is not complete.</strong><p className="muted small">Choose a delivery address and delivery method before continuing.</p><p><Link className="button secondary" href="/checkout/delivery">Complete delivery</Link></p></section> : null}

      {cart.total_quantity > 0 ? <div className="delivery-layout">
        <div className="stack">
          <section className="card delivery-card">
            <div className="checkout-card-intro">
              <h2>Payment method</h2>
              <p>Choose from the payment options available for this order.</p>
            </div>

            {methods.length ? <form action={completeCheckoutAction} className="stack">
              <div className="shipping-method-list" role="radiogroup" aria-label="Payment method">
                {methods.map((method) => {
                  const selected = cart.selected_payment_method?.code === method.code;
                  return <label className={`shipping-method ${selected ? "selected" : ""}`} key={method.code}>
                    <div><strong>{method.title}</strong></div>
                    <input type="radio" name="payment_method" value={method.code} defaultChecked={selected} required disabled={!ready}/>
                  </label>;
                })}
              </div>

              <div className="order-context-note">
                <strong>Billing address</strong>
                <p className="muted small">Your delivery address will also be used as the billing address for this order. Your saved addresses will not be changed.</p>
              </div>

              {usesCreditOrder ? <div className="order-context-note">
                <strong>Company approval</strong>
                <p className="muted small">This order may need approval before it is placed. You’ll see the result immediately after submission.</p>
              </div> : <div className="order-context-note">
                <strong>Final check</strong>
                <p className="muted small">Availability, account permissions and the basket are checked again when you submit the order.</p>
              </div>}

              <button className="button order-primary-action" type="submit" disabled={!ready}>Submit order</button>
            </form> : <p className="error" role="alert">No payment methods are currently available for this order.</p>}
          </section>
        </div>

        <aside className="stack">
          <section className="card delivery-card checkout-summary-card">
            <h2>Order items</h2>
            <div className="checkout-line-list">
              {cart.itemsV2.items.map((item) => {
                const sku = item.configured_variant?.sku || item.product.sku;
                const employee = lineEmployee(item);
                return <div className="checkout-line" key={item.uid}>
                  <div>
                    <strong>{item.product.name}</strong>
                    <div className="muted small">{sku} · Qty {item.quantity}</div>
                    {item.configurable_options?.length ? <div className="muted small">{item.configurable_options.map((option) => `${option.option_label}: ${option.value_label}`).join(" · ")}</div> : null}
                    {item.css_kit ? <div className="badge">Grouped item</div> : item.configured_variant ? <div className="badge">Configured item</div> : null}
                    {employee ? <div className="muted small">Employee: {employee}</div> : null}
                  </div>
                </div>;
              })}
            </div>
          </section>

          <section className="card delivery-card basket-totals checkout-summary-card">
            <h2>Order summary</h2>
            <dl>
              <div><dt>Subtotal ex VAT</dt><dd>{money(cart.prices?.subtotal_excluding_tax)}</dd></div>
              <div className="basket-grand-total"><dt>Grand total</dt><dd>{money(cart.prices?.grand_total)}</dd></div>
            </dl>
          </section>

          {shippingAddress ? <section className="card delivery-card checkout-summary-card">
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
