import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCustomerCart, type CartMoney } from "@/lib/magento/cart";
import { getCustomerContext } from "@/lib/magento/context";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { requireCustomerToken } from "@/lib/session";
import {
  assignBasketEmployeeAction,
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

function employeeName(item: { css_employee: { employee_name: string } | null; css_kit: { employee_name: string } | null }) {
  return item.css_employee?.employee_name || item.css_kit?.employee_name || null;
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
  const assignedEmployeeIds = items.map(employeeId).filter((id): id is number => id !== null);
  const basketEmployeeId = assignedEmployeeIds.find((id) => activeEmployeeIds.has(id)) || null;
  const eligibility = cart.css_purchase_eligibility;
  const decisions = eligibility?.items || [];
  const decisionMessages = Array.from(new Set(decisions.map((decision) => decision.reason).filter((reason): reason is string => Boolean(reason))));
  const totalCurrency = cart.prices?.grand_total?.currency || cart.prices?.subtotal_excluding_tax?.currency || "GBP";
  const discountCurrency = cart.css_company_discount.currency || totalCurrency;

  return <>
    <SiteHeader customerName={customerName} companyName={selected?.name} basketQuantity={cart.total_quantity}/>
    <main className="shell">
      <div className="basket-heading">
        <div>
          <p className="eyebrow">Company basket</p>
          <h1>Basket</h1>
          <p className="muted">{cart.total_quantity} item{cart.total_quantity === 1 ? "" : "s"} for {selected?.name || "the selected company"}.</p>
        </div>
        <Link className="button secondary" href="/catalogue">Continue shopping</Link>
      </div>

      {messages.error ? <p className="error">{messages.error}</p> : null}
      {messages.notice ? <p className="success">{messages.notice}</p> : null}

      {!items.length ? <section className="empty card">
        <h2>Your basket is empty</h2>
        <p className="muted">Choose products from the company catalogue to start an order.</p>
        <p><Link className="button" href="/catalogue">Browse products</Link></p>
      </section> : <div className="basket-layout">
        <section className="basket-lines" aria-label="Basket items">
          {items.map((item) => {
            const assignedId = employeeId(item);
            const assignedName = employeeName(item);
            const effectiveSku = item.configured_variant?.sku || item.product.sku;
            const activeAssignedId = assignedId !== null && activeEmployeeIds.has(assignedId) ? assignedId : "";
            const constraints = item.product.css_purchase_constraints;
            return <article className="card basket-line" key={item.uid}>
              <div className="basket-line-main">
                <div className="basket-line-copy">
                  <div className="basket-line-badges">
                    {item.css_kit ? <span className="badge">Grouped item</span> : null}
                    <span className="badge">{item.product.css_stock_info.stock_status || item.product.stock_status || "Stock status unavailable"}</span>
                  </div>
                  <h2>{item.product.name}</h2>
                  <p className="muted">SKU {effectiveSku}</p>
                  {item.configurable_options?.length ? <ul className="basket-options">
                    {item.configurable_options.map((option) => <li key={`${option.option_label}:${option.value_label}`}><strong>{option.option_label}:</strong> {option.value_label}</li>)}
                  </ul> : null}
                  {item.product.css_stock_info.delivery_message ? <p className="muted small">{item.product.css_stock_info.delivery_message}</p> : null}
                  {constraints ? <p className="muted small">Quantity: minimum {constraints.minimum_quantity}{constraints.maximum_quantity !== null ? `, maximum ${constraints.maximum_quantity}` : ""}{constraints.increments_enforced ? `, increments of ${constraints.quantity_increment}` : ""}.</p> : null}
                  {ordering.usesEmployee ? <p className="basket-employee"><strong>Employee:</strong> {assignedName || "Not assigned"}</p> : null}
                </div>
                <div className="basket-line-price">
                  <span className="muted">Unit</span>
                  <strong>{money(item.prices?.price)}</strong>
                  <span className="muted">Line total</span>
                  <strong>{money(item.prices?.row_total)}</strong>
                </div>
              </div>

              <div className="basket-line-actions">
                <form action={updateBasketItemAction} className="basket-quantity-form">
                  <input type="hidden" name="item_uid" value={item.uid}/>
                  <label className="field compact-field"><span>Quantity</span><input
                    name="quantity"
                    type="number"
                    min={constraints?.minimum_quantity ?? 0.0001}
                    max={constraints?.maximum_quantity ?? undefined}
                    step={constraints?.increments_enforced ? constraints.quantity_increment : "any"}
                    defaultValue={item.quantity}
                    required
                  /></label>
                  <button className="button secondary" type="submit">Update</button>
                </form>
                <form action={removeBasketItemAction}>
                  <input type="hidden" name="item_uid" value={item.uid}/>
                  <button className="button secondary" type="submit">Remove</button>
                </form>
              </div>

              {ordering.usesEmployee && ordering.multiEmployeeBasket ? <form action={assignBasketItemEmployeeAction} className="basket-employee-form">
                <input type="hidden" name="item_uid" value={item.uid}/>
                <label className="field"><span>Assign Employee</span><select name="employee_id" required defaultValue={activeAssignedId}>
                  <option value="" disabled>Choose Employee</option>
                  {ordering.employees.map((employee) => <option value={employee.employee_id} key={employee.employee_id}>{employee.full_name}{employee.employee_code ? ` · ${employee.employee_code}` : ""}</option>)}
                </select></label>
                <button className="button secondary" type="submit">Assign</button>
              </form> : null}
            </article>;
          })}
        </section>

        <aside className="basket-sidebar stack">
          {ordering.usesEmployee && !ordering.multiEmployeeBasket ? <section className="card basket-card">
            <h2>Basket Employee</h2>
            <p className="muted">This company uses one Employee for the entire basket. Reassigning here updates every line through Fluid.</p>
            <form action={assignBasketEmployeeAction} className="stack">
              <label className="field"><span>Employee</span><select name="employee_id" required defaultValue={basketEmployeeId || ""}>
                <option value="" disabled>Choose Employee</option>
                {ordering.employees.map((employee) => <option value={employee.employee_id} key={employee.employee_id}>{employee.full_name}{employee.employee_code ? ` · ${employee.employee_code}` : ""}</option>)}
              </select></label>
              <button className="button secondary" type="submit">Assign basket</button>
            </form>
          </section> : null}

          <section className="card basket-card basket-totals">
            <h2>Order summary</h2>
            <dl>
              <div><dt>Subtotal ex VAT</dt><dd>{money(cart.prices?.subtotal_excluding_tax)}</dd></div>
              {cart.css_company_discount.applied ? <div><dt>{cart.css_company_discount.label || "Company discount"} ({cart.css_company_discount.percent}%)</dt><dd>−{new Intl.NumberFormat("en-GB", { style: "currency", currency: discountCurrency }).format(cart.css_company_discount.amount)}</dd></div> : null}
              <div className="basket-grand-total"><dt>Grand total</dt><dd>{money(cart.prices?.grand_total)}</dd></div>
            </dl>
          </section>

          {eligibility ? <section className="card basket-card">
            <h2>Purchase status</h2>
            <p><span className="badge">{eligibility.approval_status.replaceAll("_", " ")}</span></p>
            {decisionMessages.length ? <ul className="basket-status-list">{decisionMessages.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p className="muted">Fluid has not reported any purchase-control warnings for this basket.</p>}
          </section> : null}

          {cart.css_company_credit?.has_credit_account ? <section className="card basket-card">
            <h2>Company credit</h2>
            <p className="muted">Credit state is shown from Fluid for context only; payment selection comes in the checkout slice.</p>
            <dl>
              <div><dt>Remaining</dt><dd>{cart.css_company_credit.remaining_amount !== null && cart.css_company_credit.currency ? new Intl.NumberFormat("en-GB", { style: "currency", currency: cart.css_company_credit.currency }).format(cart.css_company_credit.remaining_amount) : "—"}</dd></div>
              <div><dt>On-account available</dt><dd>{cart.css_company_credit.can_pay_on_account ? "Yes" : "No"}</dd></div>
            </dl>
          </section> : null}

          <section className="card basket-card stack">
            <h2>Ready for delivery?</h2>
            <p className="muted small">Magento will determine the available delivery methods from the address and the current simple, configurable or grouped/configurable basket.</p>
            <Link className="button" href="/checkout/delivery">Continue to delivery</Link>
          </section>
        </aside>
      </div>}
    </main>
  </>;
}
