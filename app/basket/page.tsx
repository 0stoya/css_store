import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { EmployeePicker } from "@/components/employee-picker";
import { QuantityStepper } from "@/components/quantity-stepper";
import { SiteHeader } from "@/components/site-header";
import { getCustomerCart, type CartMoney } from "@/lib/magento/cart";
import { getCustomerContext } from "@/lib/magento/context";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { requireCustomerToken } from "@/lib/session";
import {
  assignBasketItemEmployeeAction,
  removeBasketItemAction,
  updateBasketItemAction,
} from "./actions";

export const metadata = { title: "Basket" };

function money(value: CartMoney | null | undefined) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: value.currency }).format(value.value);
}

function employeeId(item: { css_employee: { employee_id: number | null } | null; css_kit: { employee_id: number | null } | null }) {
  return item.css_employee?.employee_id ?? item.css_kit?.employee_id ?? null;
}

export default async function BasketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const token = await requireCustomerToken();
  const [ctx, cart, ordering, messages] = await Promise.all([
    getCustomerContext(token),
    getCustomerCart(token),
    getEmployeeOrdering(token),
    searchParams,
  ]);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const items = cart.itemsV2.items;
  const activeEmployeeIds = new Set(ordering.employees.map((employee) => employee.employee_id));
  const totalCurrency = cart.prices?.grand_total?.currency || cart.prices?.subtotal_excluding_tax?.currency || "GBP";
  const discountCurrency = cart.css_company_discount.currency || totalCurrency;
  const singleEmployeeCheckout = ordering.usesEmployee && !ordering.multiEmployeeBasket;
  const checkoutHref = singleEmployeeCheckout ? "/checkout/employee" : "/checkout/delivery";

  return <>
    <SiteHeader customerName={customerName} companyName={selected?.name} basketQuantity={cart.total_quantity}/>
    <main className="shell basket-page">
      <div className="basket-heading">
        <div>
          <p className="eyebrow">Your order</p>
          <h1>Basket</h1>
          <p className="muted">{cart.total_quantity} item{cart.total_quantity === 1 ? "" : "s"} for {selected?.name || "your selected company"}.</p>
        </div>
        <Link className="button secondary" href="/catalogue">Continue shopping</Link>
      </div>

      {messages.error ? <p className="error basket-message" role="alert">{messages.error}</p> : null}
      {messages.notice ? <p className="success basket-message" role="status">{messages.notice}</p> : null}

      {!items.length ? <section className="empty card">
        <h2>Your basket is empty</h2>
        <p className="muted">Browse the catalogue to add products to your order.</p>
        <p><Link className="button" href="/catalogue">Browse products</Link></p>
      </section> : <div className="basket-layout basket-production-layout">
        <section className="basket-lines" aria-label="Basket items">
          {items.map((item) => {
            const assignedId = employeeId(item);
            const effectiveSku = item.configured_variant?.sku || item.product.sku;
            const activeAssignedId = assignedId !== null && activeEmployeeIds.has(assignedId) ? assignedId : null;
            const constraints = item.product.css_purchase_constraints;
            return <article className="card basket-line basket-production-line" key={item.uid}>
              <div className="basket-line-main">
                <div className="basket-line-copy">
                  <div className="basket-line-badges">
                    {item.css_kit ? <span className="badge">Grouped item</span> : null}
                    <span className="badge">{item.product.css_stock_info.stock_status || item.product.stock_status || "Stock status unavailable"}</span>
                  </div>
                  <h2>{item.product.name}</h2>
                  <p className="muted small">SKU {effectiveSku}</p>
                  {item.configurable_options?.length ? <ul className="basket-options">
                    {item.configurable_options.map((option) => <li key={`${option.option_label}:${option.value_label}`}><strong>{option.option_label}:</strong> {option.value_label}</li>)}
                  </ul> : null}
                </div>
                <div className="basket-line-price">
                  <span className="muted">Unit</span>
                  <strong>{money(item.prices?.price)}</strong>
                  <span className="muted">Line total</span>
                  <strong>{money(item.prices?.row_total)}</strong>
                </div>
              </div>

              <div className="basket-line-actions basket-production-actions">
                <form action={updateBasketItemAction} className="basket-quantity-form">
                  <input type="hidden" name="item_uid" value={item.uid}/>
                  <QuantityStepper
                    name="quantity"
                    defaultValue={item.quantity}
                    min={constraints?.minimum_quantity ?? 0.0001}
                    max={constraints?.maximum_quantity ?? undefined}
                    step={constraints?.increments_enforced ? constraints.quantity_increment : "any"}
                    compact
                  />
                  <button className="button secondary basket-update-button" type="submit">Update</button>
                </form>
                <form action={removeBasketItemAction}>
                  <input type="hidden" name="item_uid" value={item.uid}/>
                  <button className="button secondary basket-remove-button" type="submit">
                    <Trash2 size={16} aria-hidden="true"/>
                    <span>Remove</span>
                  </button>
                </form>
              </div>

              {ordering.usesEmployee && ordering.multiEmployeeBasket ? <form action={assignBasketItemEmployeeAction} className="basket-employee-form basket-production-employee">
                <input type="hidden" name="item_uid" value={item.uid}/>
                <EmployeePicker employees={ordering.employees} defaultSelectedId={activeAssignedId}/>
                <button className="button secondary" type="submit">Update Employee</button>
              </form> : null}
            </article>;
          })}
        </section>

        <aside className="basket-sidebar">
          <section className="card basket-card basket-totals basket-checkout-summary">
            <h2>Order summary</h2>
            <dl>
              <div><dt>Subtotal ex VAT</dt><dd>{money(cart.prices?.subtotal_excluding_tax)}</dd></div>
              {cart.css_company_discount.applied ? <div><dt>{cart.css_company_discount.label || "Company discount"} ({cart.css_company_discount.percent}%)</dt><dd>−{new Intl.NumberFormat("en-GB", { style: "currency", currency: discountCurrency }).format(cart.css_company_discount.amount)}</dd></div> : null}
              <div className="basket-grand-total"><dt>Grand total</dt><dd>{money(cart.prices?.grand_total)}</dd></div>
            </dl>

            <div className="basket-checkout-action">
              <p className="muted small">{singleEmployeeCheckout
                ? "Choose the Employee for this order before delivery."
                : "Continue to choose your delivery address and method."}</p>
              <Link className="button" href={checkoutHref}>
                <span>{singleEmployeeCheckout ? "Choose Employee" : "Continue to delivery"}</span>
                <ArrowRight size={18} aria-hidden="true"/>
              </Link>
            </div>
          </section>
        </aside>
      </div>}
    </main>
  </>;
}
