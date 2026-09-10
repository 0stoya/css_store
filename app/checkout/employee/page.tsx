import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getCustomerCart } from "@/lib/magento/cart";
import { getCustomerContext } from "@/lib/magento/context";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { requireCustomerToken } from "@/lib/session";
import { selectCheckoutEmployeeAction } from "./actions";

export const metadata = { title: "Choose Employee" };

function assignedEmployeeId(item: {
  css_employee: { employee_id: number | null } | null;
  css_kit: { employee_id: number | null } | null;
}) {
  return item.css_employee?.employee_id ?? item.css_kit?.employee_id ?? null;
}

export default async function CheckoutEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const token = await requireCustomerToken();
  const [ctx, cart, ordering, messages] = await Promise.all([
    getCustomerContext(token),
    getCustomerCart(token),
    getEmployeeOrdering(token),
    searchParams,
  ]);

  if (!ordering.usesEmployee || ordering.multiEmployeeBasket) {
    redirect("/checkout/delivery");
  }

  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const activeEmployeeIds = new Set(ordering.employees.map((employee) => employee.employee_id));
  const assignedIds = cart.itemsV2.items.map(assignedEmployeeId).filter((id): id is number => id !== null);
  const currentEmployeeId = assignedIds.length === cart.itemsV2.items.length
    && assignedIds.length > 0
    && assignedIds.every((id) => id === assignedIds[0])
    && activeEmployeeIds.has(assignedIds[0])
    ? assignedIds[0]
    : "";

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name} basketQuantity={cart.total_quantity}/>
    <main className="shell stack">
      <div className="basket-heading">
        <div>
          <p className="eyebrow">Checkout · Employee</p>
          <h1>Who is this order for?</h1>
          <p className="muted">Choose one Employee for the whole order before continuing to delivery.</p>
        </div>
        <Link className="button secondary" href="/basket">Back to basket</Link>
      </div>

      {messages.error ? <p className="error" role="alert">{messages.error}</p> : null}

      {!cart.total_quantity ? <section className="empty card">
        <h2>Your basket is empty</h2>
        <p className="muted">Add products before starting checkout.</p>
        <p><Link className="button" href="/catalogue">Browse products</Link></p>
      </section> : <div className="delivery-layout">
        <section className="card delivery-card stack">
          <div>
            <h2>Choose an Employee</h2>
            <p className="muted">The Employee you select will be assigned to every item in this order.</p>
          </div>

          {ordering.employees.length ? <form action={selectCheckoutEmployeeAction} className="stack">
            <label className="field employee-field">
              <span>Employee</span>
              <select name="employee_id" required defaultValue={currentEmployeeId}>
                <option value="" disabled>Choose Employee</option>
                {ordering.employees.map((employee) => <option value={employee.employee_id} key={employee.employee_id}>
                  {employee.full_name}{employee.employee_code ? ` · ${employee.employee_code}` : ""}{employee.department ? ` · ${employee.department}` : ""}
                </option>)}
              </select>
            </label>
            <div>
              <button className="button" type="submit">Continue to delivery</button>
            </div>
          </form> : <p className="error">No active Employees are available for this company. Please contact your account administrator before continuing.</p>}
        </section>

        <aside className="stack">
          <section className="card delivery-card">
            <h2>Order items</h2>
            <div className="checkout-line-list">
              {cart.itemsV2.items.map((item) => <div className="checkout-line" key={item.uid}>
                <strong>{item.product.name}</strong>
                <div className="muted small">{item.configured_variant?.sku || item.product.sku} · Qty {item.quantity}</div>
              </div>)}
            </div>
          </section>
        </aside>
      </div>}
    </main>
  </>;
}
