import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, MapPin, Plus, Truck } from "lucide-react";
import { CheckoutSteps } from "@/components/checkout-steps";
import { SiteHeader } from "@/components/site-header";
import type { CartMoney } from "@/lib/magento/cart";
import { getCustomerContext } from "@/lib/magento/context";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { getDeliveryContext } from "@/lib/magento/shipping";
import { requireCustomerToken } from "@/lib/session";
import { preparePaymentAction } from "../payment/actions";
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
  const [ctx, delivery, ordering, messages] = await Promise.all([
    getCustomerContext(token),
    getDeliveryContext(token),
    getEmployeeOrdering(token),
    searchParams,
  ]);
  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const cart = delivery.customerCart;
  const shippingAddress = cart.shipping_addresses[0] || null;
  const methods = (shippingAddress?.available_shipping_methods || []).filter((method) => method.available !== false);
  const selectedMethod = shippingAddress?.selected_shipping_method || null;
  const selectedMethodOption = selectedMethod
    ? methods.find((method) => method.carrier_code === selectedMethod.carrier_code && method.method_code === selectedMethod.method_code) || null
    : null;
  const canCheckout = delivery.css_ordering_capabilities.authenticated
    && delivery.css_ordering_capabilities.company_context
    && delivery.css_ordering_capabilities.company_active
    && delivery.css_ordering_capabilities.can_checkout;
  const defaultCountry = delivery.customer.addresses.find((address) => address.default_shipping)?.country_code
    || delivery.customer.addresses[0]?.country_code
    || "GB";
  const includeEmployee = ordering.usesEmployee && !ordering.multiEmployeeBasket;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name} basketQuantity={cart.total_quantity}/>
    <main className="shell stack delivery-page">
      <CheckoutSteps current="delivery" includeEmployee={includeEmployee}/>

      <div className="basket-heading checkout-heading">
        <div>
          <p className="eyebrow">Checkout</p>
          <h1>Delivery</h1>
          <p className="muted">Choose where your order should be delivered and how you’d like it sent.</p>
        </div>
        <Link className="button secondary delivery-back" href={includeEmployee ? "/checkout/employee" : "/basket"}>
          <ArrowLeft size={16} aria-hidden="true"/>
          <span>{includeEmployee ? "Back to Employee" : "Back to basket"}</span>
        </Link>
      </div>

      {messages.error ? <p className="error" role="alert">{messages.error}</p> : null}
      {messages.notice ? <p className="success" role="status">{messages.notice}</p> : null}
      {!cart.total_quantity ? <section className="empty card"><h2>Your basket is empty</h2><p><Link className="button" href="/catalogue">Browse products</Link></p></section> : null}
      {cart.total_quantity > 0 && !canCheckout ? <p className="error" role="alert">This company is not currently able to continue through checkout.</p> : null}

      {cart.total_quantity > 0 ? <div className="delivery-layout delivery-layout-refined">
        <div className="stack delivery-main-column">
          <section className="card delivery-card delivery-address-card">
            <div className="checkout-card-intro">
              <h2>Delivery address</h2>
              <p>Choose one of your saved addresses.</p>
            </div>
            {delivery.customer.addresses.length ? <div className="address-grid delivery-address-grid">
              {delivery.customer.addresses.map((address) => <article className="address-card delivery-saved-address" key={address.id}>
                <div className="delivery-address-heading">
                  <span className="delivery-address-icon"><MapPin size={18} aria-hidden="true"/></span>
                  <div>
                    <strong>{address.firstname} {address.lastname}</strong>
                    {address.default_shipping ? <span className="badge">Default</span> : null}
                  </div>
                </div>
                <p>{addressText(address)}</p>
                {address.telephone ? <p className="muted small">{address.telephone}</p> : null}
                <form action={selectSavedShippingAddressAction}>
                  <input type="hidden" name="customer_address_id" value={address.id}/>
                  <button className="button secondary" type="submit" disabled={!canCheckout}>Deliver here</button>
                </form>
              </article>)}
            </div> : <p className="notice">You do not have a saved delivery address. Enter an address below to continue.</p>}

            <details className="delivery-alt-address" open={!delivery.customer.addresses.length}>
              <summary>
                <span><Plus size={17} aria-hidden="true"/>Use a different address</span>
                <ChevronDown className="delivery-alt-chevron" size={18} aria-hidden="true"/>
              </summary>
              <div className="delivery-alt-address-body">
                <p className="muted small">This address will be used for this order only and won’t be added to your saved addresses.</p>
                <form action={setNewShippingAddressAction} className="delivery-form">
                  <label className="field"><span>First name</span><input name="firstname" autoComplete="given-name" defaultValue={delivery.customer.firstname} required/></label>
                  <label className="field"><span>Last name</span><input name="lastname" autoComplete="family-name" defaultValue={delivery.customer.lastname} required/></label>
                  <label className="field delivery-span-2"><span>Company</span><input name="company" autoComplete="organization" defaultValue={selectedCompany?.name || ""}/></label>
                  <label className="field delivery-span-2"><span>Address line 1</span><input name="street_1" autoComplete="address-line1" required/></label>
                  <label className="field delivery-span-2"><span>Address line 2</span><input name="street_2" autoComplete="address-line2"/></label>
                  <label className="field"><span>Town / city</span><input name="city" autoComplete="address-level2" required/></label>
                  <label className="field"><span>County / region</span><input name="region" autoComplete="address-level1"/></label>
                  <label className="field"><span>Postcode</span><input name="postcode" autoComplete="postal-code" required/></label>
                  <label className="field"><span>Country</span><select name="country_code" autoComplete="country" defaultValue={defaultCountry} required>
                    {delivery.countries.map((country) => <option value={country.id} key={country.id}>{country.full_name_locale || country.id}</option>)}
                  </select></label>
                  <label className="field delivery-span-2"><span>Telephone</span><input name="telephone" type="tel" autoComplete="tel" required/></label>
                  <div className="delivery-span-2"><button className="button" type="submit" disabled={!canCheckout}>Use this address</button></div>
                </form>
              </div>
            </details>
          </section>

          {shippingAddress ? <section className="card delivery-card delivery-method-card">
            <div className="checkout-card-intro">
              <h2>Delivery method</h2>
              <p>Choose how you’d like this order delivered.</p>
            </div>
            <div className="shipping-method-list delivery-method-list">
              {methods.map((method) => {
                const active = selectedMethod?.carrier_code === method.carrier_code && selectedMethod.method_code === method.method_code;
                return <form action={selectShippingMethodAction} className={`shipping-method delivery-method-option ${active ? "selected" : ""}`} key={`${method.carrier_code}:${method.method_code}`}>
                  <input type="hidden" name="carrier_code" value={method.carrier_code}/>
                  <input type="hidden" name="method_code" value={method.method_code}/>
                  <span className="delivery-method-icon"><Truck size={18} aria-hidden="true"/></span>
                  <div className="delivery-method-copy">
                    <strong>{method.carrier_title || method.carrier_code}</strong>
                    <span>{method.method_title || method.method_code}</span>
                    {method.error_message ? <span className="muted small">{method.error_message}</span> : null}
                  </div>
                  <strong className="delivery-method-price">{money(method.amount)}</strong>
                  <button className={`button ${active ? "delivery-selected-button" : "secondary"}`} type="submit" disabled={active || !canCheckout}>
                    {active ? <><Check size={16} aria-hidden="true"/><span>Selected</span></> : "Select"}
                  </button>
                </form>;
              })}
            </div>
            {!methods.length ? <p className="error" role="alert">No delivery methods are currently available for this address and basket.</p> : null}
          </section> : null}
        </div>

        <aside className="delivery-summary-column">
          <section className="card delivery-card basket-totals checkout-summary-card delivery-summary-card">
            <h2>Order summary</h2>
            <p className="muted small">{cart.total_quantity} item{cart.total_quantity === 1 ? "" : "s"}</p>
            <dl>
              <div><dt>Subtotal ex VAT</dt><dd>{money(cart.prices?.subtotal_excluding_tax)}</dd></div>
              {selectedMethod ? <div><dt>Delivery</dt><dd>{selectedMethodOption ? money(selectedMethodOption.amount) : "Selected"}</dd></div> : null}
              <div className="basket-grand-total"><dt>Grand total</dt><dd>{money(cart.prices?.grand_total)}</dd></div>
            </dl>

            {selectedMethod ? <div className="delivery-summary-method">
              <Truck size={17} aria-hidden="true"/>
              <span>{selectedMethod.carrier_title || selectedMethod.carrier_code} · {selectedMethod.method_title || selectedMethod.method_code}</span>
            </div> : <p className="muted small delivery-summary-hint">Choose a delivery address and method to continue.</p>}

            {selectedMethod && canCheckout ? <form action={preparePaymentAction} className="delivery-summary-action">
              <button className="button" type="submit">Continue to payment</button>
            </form> : null}
          </section>
        </aside>
      </div> : null}
    </main>
  </>;
}
