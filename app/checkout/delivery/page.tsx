import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import type { CartMoney } from "@/lib/magento/cart";
import { getCustomerContext } from "@/lib/magento/context";
import { getDeliveryContext } from "@/lib/magento/shipping";
import { requireCustomerToken } from "@/lib/session";
import {
  selectSavedShippingAddressAction,
  selectShippingMethodAction,
  setNewShippingAddressAction,
} from "./actions";

export const metadata = { title: "Delivery" };

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
  region?: { region?: string | null; label?: string | null } | null;
  postcode: string;
  country_code?: string;
  country?: { code: string; label: string | null } | null;
}) {
  return [
    address.company,
    ...address.street,
    address.city,
    address.region?.region || address.region?.label,
    address.postcode,
    address.country_code || address.country?.label || address.country?.code,
  ].filter(Boolean).join(", ");
}

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const token = await requireCustomerToken();
  const [ctx, delivery, messages] = await Promise.all([
    getCustomerContext(token),
    getDeliveryContext(token),
    searchParams,
  ]);
  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const cart = delivery.customerCart;
  const shippingAddress = cart.shipping_addresses[0] || null;
  const methods = (shippingAddress?.available_shipping_methods || []).filter((method) => method.available !== false);
  const selectedMethod = shippingAddress?.selected_shipping_method || null;
  const canCheckout = delivery.css_ordering_capabilities.authenticated
    && delivery.css_ordering_capabilities.company_context
    && delivery.css_ordering_capabilities.company_active
    && delivery.css_ordering_capabilities.can_checkout;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name} basketQuantity={cart.total_quantity}/>
    <main className="shell stack">
      <div className="basket-heading">
        <div>
          <p className="eyebrow">Checkout · delivery</p>
          <h1>Delivery</h1>
          <p className="muted">Choose where this company basket should be delivered, then select a method returned by Magento.</p>
        </div>
        <Link className="button secondary" href="/basket">Back to basket</Link>
      </div>

      {messages.error ? <p className="error">{messages.error}</p> : null}
      {messages.notice ? <p className="success">{messages.notice}</p> : null}
      {!cart.total_quantity ? <section className="empty card"><h2>Your basket is empty</h2><p><Link className="button" href="/catalogue">Browse products</Link></p></section> : null}
      {cart.total_quantity > 0 && !canCheckout ? <p className="error">This company is not currently allowed to proceed through checkout.</p> : null}

      {cart.total_quantity > 0 ? <div className="delivery-layout">
        <div className="stack">
          <section className="card delivery-card">
            <h2>Saved delivery addresses</h2>
            <p className="muted">These addresses come from the authenticated Magento customer account.</p>
            {delivery.customer.addresses.length ? <div className="address-grid">
              {delivery.customer.addresses.map((address) => <article className="address-card" key={address.id}>
                <div>
                  <strong>{address.firstname} {address.lastname}</strong>
                  {address.default_shipping ? <span className="badge">Default</span> : null}
                </div>
                <p>{addressText(address)}</p>
                <p className="muted small">{address.telephone}</p>
                <form action={selectSavedShippingAddressAction}>
                  <input type="hidden" name="customer_address_id" value={address.id}/>
                  <button className="button secondary" type="submit" disabled={!canCheckout}>Deliver here</button>
                </form>
              </article>)}
            </div> : <p className="notice">No saved Magento delivery addresses are available. Use a one-off address below.</p>}
          </section>

          <section className="card delivery-card">
            <h2>Use a one-off delivery address</h2>
            <p className="muted">This address is applied to the current cart only and is not written into the Magento address book.</p>
            <form action={setNewShippingAddressAction} className="delivery-form">
              <label className="field"><span>First name</span><input name="firstname" defaultValue={delivery.customer.firstname} required/></label>
              <label className="field"><span>Last name</span><input name="lastname" defaultValue={delivery.customer.lastname} required/></label>
              <label className="field delivery-span-2"><span>Company</span><input name="company" defaultValue={selectedCompany?.name || ""}/></label>
              <label className="field delivery-span-2"><span>Address line 1</span><input name="street_1" required/></label>
              <label className="field delivery-span-2"><span>Address line 2</span><input name="street_2"/></label>
              <label className="field"><span>Town / city</span><input name="city" required/></label>
              <label className="field"><span>County / region</span><input name="region"/></label>
              <label className="field"><span>Postcode</span><input name="postcode" required/></label>
              <label className="field"><span>Country code</span><input name="country_code" defaultValue="GB" maxLength={2} pattern="[A-Za-z]{2}" required/></label>
              <label className="field delivery-span-2"><span>Telephone</span><input name="telephone" type="tel" required/></label>
              <div className="delivery-span-2"><button className="button" type="submit" disabled={!canCheckout}>Use this address</button></div>
            </form>
          </section>

          {shippingAddress ? <section className="card delivery-card">
            <h2>Delivery methods</h2>
            <p className="muted">Available methods are returned by Magento for the selected address and current basket.</p>
            <div className="shipping-method-list">
              {methods.map((method) => {
                const active = selectedMethod?.carrier_code === method.carrier_code && selectedMethod.method_code === method.method_code;
                return <form action={selectShippingMethodAction} className={`shipping-method ${active ? "selected" : ""}`} key={`${method.carrier_code}:${method.method_code}`}>
                  <input type="hidden" name="carrier_code" value={method.carrier_code}/>
                  <input type="hidden" name="method_code" value={method.method_code}/>
                  <div><strong>{method.carrier_title || method.carrier_code} · {method.method_title || method.method_code}</strong>{method.error_message ? <p className="muted small">{method.error_message}</p> : null}</div>
                  <strong>{money(method.amount)}</strong>
                  <button className="button secondary" type="submit" disabled={active || !canCheckout}>{active ? "Selected" : "Select"}</button>
                </form>;
              })}
            </div>
            {!methods.length ? <p className="error">Magento has not returned an available delivery method for this address and basket.</p> : null}
          </section> : null}
        </div>

        <aside className="stack">
          <section className="card delivery-card">
            <h2>Basket carried into checkout</h2>
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
            <h2>Current delivery</h2>
            <p><strong>{shippingAddress.firstname} {shippingAddress.lastname}</strong></p>
            <p className="muted">{addressText(shippingAddress)}</p>
            {selectedMethod ? <p><span className="badge">{selectedMethod.carrier_title || selectedMethod.carrier_code} · {selectedMethod.method_title || selectedMethod.method_code}</span></p> : <p className="notice">Choose a delivery method to complete this step.</p>}
          </section> : null}

          <section className="notice">
            <strong>{selectedMethod ? "Delivery step complete." : "Select an address and delivery method."}</strong>
            <p className="muted small">Payment and final order placement remain in the next Phase 3 slice.</p>
          </section>
        </aside>
      </div> : null}
    </main>
  </>;
}
