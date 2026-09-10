import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  MapPin,
  Phone,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Truck,
  WalletCards,
} from "lucide-react";
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
  const submitLabel = usesCreditOrder ? "Submit for approval" : "Place order";

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name} basketQuantity={cart.total_quantity}/>
    <main className="shell stack payment-page">
      <CheckoutSteps current="payment" includeEmployee={includeEmployee}/>

      <div className="basket-heading checkout-heading">
        <div>
          <p className="eyebrow">Checkout</p>
          <h1>Payment & review</h1>
          <p className="muted">Choose a payment method and confirm your order.</p>
        </div>
        <Link className="button secondary payment-back" href="/checkout/delivery">
          <ArrowLeft size={16} aria-hidden="true"/>
          <span>Back to delivery</span>
        </Link>
      </div>

      {messages.error ? <p className="error" role="alert">{messages.error}</p> : null}
      {messages.notice ? <p className="success" role="status">{messages.notice}</p> : null}

      {!cart.total_quantity ? <section className="empty card"><h2>Your basket is empty</h2><p><Link className="button" href="/catalogue">Browse products</Link></p></section> : null}
      {cart.total_quantity > 0 && !canCheckout ? <p className="error" role="alert">This company is not currently able to place this order.</p> : null}
      {cart.total_quantity > 0 && canCheckout && !nativeApprovalAllowed ? <p className="error" role="alert">This order is not currently authorised for submission. Return to your basket or contact your account administrator.</p> : null}
      {cart.total_quantity > 0 && (!shippingAddress || !shippingMethod) ? <section className="notice"><strong>Delivery is not complete.</strong><p className="muted small">Choose a delivery address and method before continuing.</p><p><Link className="button secondary" href="/checkout/delivery">Complete delivery</Link></p></section> : null}

      {cart.total_quantity > 0 ? <form action={completeCheckoutAction} className="payment-layout">
        <div className="payment-main-column stack">
          <section className="card payment-card">
            <div className="checkout-card-intro">
              <h2>Payment method</h2>
              <p>Choose from the payment options available for this order.</p>
            </div>

            {methods.length ? <div className="payment-method-list" role="radiogroup" aria-label="Payment method">
              {methods.map((method) => {
                const selected = cart.selected_payment_method?.code === method.code;
                return <label className="payment-method-option" key={method.code}>
                  <span className="payment-method-icon"><WalletCards size={19} aria-hidden="true"/></span>
                  <span className="payment-method-copy"><strong>{method.title}</strong></span>
                  <input type="radio" name="payment_method" value={method.code} defaultChecked={selected} required disabled={!ready}/>
                  <span className="payment-radio-mark" aria-hidden="true"><Check size={14}/></span>
                </label>;
              })}
            </div> : <p className="error" role="alert">No payment methods are currently available for this order.</p>}

            {shippingAddress ? <div className="payment-context-row">
              <ReceiptText size={17} aria-hidden="true"/>
              <div><strong>Billing address</strong><span>Same as your delivery address</span></div>
            </div> : null}
          </section>

          <details className="card payment-items-review">
            <summary>
              <span className="payment-items-summary-copy">
                <ShoppingBag size={19} aria-hidden="true"/>
                <span><strong>Review order items</strong><small>{cart.total_quantity} item{cart.total_quantity === 1 ? "" : "s"}</small></span>
              </span>
              <ChevronDown className="payment-items-chevron" size={18} aria-hidden="true"/>
            </summary>
            <div className="payment-item-list">
              {cart.itemsV2.items.map((item) => {
                const sku = item.configured_variant?.sku || item.product.sku;
                const employee = lineEmployee(item);
                return <div className="payment-item-row" key={item.uid}>
                  <div>
                    <strong>{item.product.name}</strong>
                    <span>{sku}</span>
                    {item.configurable_options?.length ? <span>{item.configurable_options.map((option) => `${option.option_label}: ${option.value_label}`).join(" · ")}</span> : null}
                    {employee ? <span>Employee: {employee}</span> : null}
                  </div>
                  <strong className="payment-item-qty">Qty {item.quantity}</strong>
                </div>;
              })}
            </div>
          </details>
        </div>

        <aside className="payment-summary-column">
          <section className="card payment-summary-card">
            <h2>Order summary</h2>
            <p className="muted small">{cart.total_quantity} item{cart.total_quantity === 1 ? "" : "s"}</p>

            <dl className="payment-totals">
              <div><dt>Subtotal ex VAT</dt><dd>{money(cart.prices?.subtotal_excluding_tax)}</dd></div>
              {shippingMethod ? <div><dt>Delivery</dt><dd>{money(shippingMethod.amount)}</dd></div> : null}
              <div className="payment-grand-total"><dt>Grand total</dt><dd>{money(cart.prices?.grand_total)}</dd></div>
            </dl>

            {shippingAddress ? <div className="payment-delivery-review">
              <div className="payment-review-heading"><MapPin size={17} aria-hidden="true"/><strong>Delivery</strong></div>
              <strong>{shippingAddress.firstname} {shippingAddress.lastname}</strong>
              <span>{shippingAddress.street.filter(Boolean).join(", ")}</span>
              <span>{shippingAddress.city}</span>
              <span>{shippingAddress.country?.label || shippingAddress.country?.code} · {shippingAddress.postcode}</span>
              {shippingAddress.telephone ? <span className="payment-phone"><Phone size={14} aria-hidden="true"/>{shippingAddress.telephone}</span> : null}
              {shippingMethod ? <span className="payment-shipping-method"><Truck size={15} aria-hidden="true"/>{shippingMethod.carrier_title || shippingMethod.carrier_code} · {shippingMethod.method_title || shippingMethod.method_code}</span> : null}
            </div> : null}

            {usesCreditOrder ? <div className="payment-approval-note">
              <ShieldCheck size={17} aria-hidden="true"/>
              <span>This order may require company approval.</span>
            </div> : null}

            <button className="button payment-submit" type="submit" disabled={!ready || !methods.length}>{submitLabel}</button>
          </section>
        </aside>
      </form> : null}
    </main>
  </>;
}
