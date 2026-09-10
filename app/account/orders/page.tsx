import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import type { CartMoney } from "@/lib/magento/cart";
import { getCompanyOrders, type CompanyOrderItem } from "@/lib/magento/orders";
import { requireCustomerToken } from "@/lib/session";
import { repeatOrderAction } from "./actions";
import styles from "./orders.module.css";

export const metadata = { title: "Order history" };

const PAGE_SIZE = 10;

function money(value: CartMoney | null | undefined) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: value.currency }).format(value.value);
}

function positivePage(value: string | undefined) {
  const page = Number(value || "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function itemOptions(item: CompanyOrderItem) {
  return [...(item.selected_options || []), ...(item.entered_options || [])];
}

function itemState(item: CompanyOrderItem) {
  const parts: string[] = [];
  if (item.quantity_shipped > 0) parts.push(`${item.quantity_shipped} shipped`);
  if (item.quantity_refunded > 0) parts.push(`${item.quantity_refunded} refunded`);
  if (item.quantity_canceled > 0) parts.push(`${item.quantity_canceled} cancelled`);
  return parts.join(" · ");
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; error?: string; notice?: string; warning?: string }>;
}) {
  const token = await requireCustomerToken();
  const params = await searchParams;
  const requestedPage = positivePage(params.page);
  const data = await getCompanyOrders(token, requestedPage, PAGE_SIZE);
  const orders = data.css_company_orders;
  const page = orders.page_info.current_page || requestedPage;
  const selectedCompany = data.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${data.customer.firstname} ${data.customer.lastname}`.trim();
  const companyScope = data.css_ordering_capabilities.can_view_company_orders;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell stack">
      <div className="basket-heading">
        <div>
          <p className="eyebrow">Customer account · orders</p>
          <h1>Order history</h1>
          <p className="muted">
            {companyScope
              ? `Showing orders visible across ${selectedCompany?.name || "the selected company"}.`
              : `Showing your orders for ${selectedCompany?.name || "the selected company"}.`}
          </p>
        </div>
        <Link className="button secondary" href="/account">Back to account</Link>
      </div>

      {params.error ? <p className="error">{params.error}</p> : null}
      {params.warning ? <p className="error">{params.warning}</p> : null}
      {params.notice ? <p className="success">{params.notice}</p> : null}

      <section className={`card ${styles.intro}`}>
        <div>
          <strong>{orders.total_count} {orders.total_count === 1 ? "order" : "orders"}</strong>
          <p className="muted small">Visibility and selected-company scope come from Fluid `css_company_orders`.</p>
        </div>
        <span className="badge">{companyScope ? "Company-visible orders" : "Own orders"}</span>
      </section>

      {!orders.items.length ? <section className="empty card">
        <h2>No orders found</h2>
        <p className="muted">There are no storefront-visible Magento orders in this company context yet.</p>
        <p><Link className="button" href="/catalogue">Browse products</Link></p>
      </section> : <div className={styles.list}>
        {orders.items.map((order) => <details className={`card ${styles.card}`} key={order.number}>
          <summary className={styles.summary}>
            <div>
              <span className="eyebrow">Order {order.number}</span>
              <strong>{order.order_date}</strong>
            </div>
            <div className={styles.summaryMeta}>
              <span className="badge">{order.status}</span>
              <strong>{money(order.total?.grand_total)}</strong>
              <span className="muted small">View details</span>
            </div>
          </summary>

          <div className={`${styles.detail} stack`}>
            <section>
              <h2>Items</h2>
              <div className={styles.itemList}>
                {(order.items || []).map((item) => {
                  const options = itemOptions(item);
                  const state = itemState(item);
                  return <article className={styles.itemRow} key={item.id}>
                    <div className={styles.itemCopy}>
                      <div className={styles.itemTitle}>
                        <strong>{item.product_name || item.product_sku}</strong>
                        {options.length ? <span className="badge">Configured item</span> : item.product_type === "grouped" ? <span className="badge">Grouped item</span> : null}
                      </div>
                      <div className="muted small">SKU {item.product_sku}</div>
                      {options.length ? <ul className="basket-options">
                        {options.map((option, index) => <li key={`${item.id}-${option.label}-${index}`}><strong>{option.label}:</strong> {option.value}</li>)}
                      </ul> : null}
                      {item.css_employee ? <div className={styles.employee}>
                        <span className="badge">Employee</span>
                        <span>{item.css_employee.employee_name}{item.css_employee.employee_code ? ` · ${item.css_employee.employee_code}` : ""}</span>
                      </div> : null}
                      {state ? <div className="muted small">{state}</div> : null}
                    </div>
                    <dl className={styles.itemMoney}>
                      <div><dt>Quantity</dt><dd>{item.quantity_ordered}</dd></div>
                      <div><dt>Unit price</dt><dd>{money(item.product_sale_price)}</dd></div>
                      <div><dt>Row total</dt><dd>{money(item.prices?.row_total)}</dd></div>
                    </dl>
                  </article>;
                })}
              </div>
            </section>

            <section className={styles.totalCard}>
              <h2>Order totals</h2>
              <dl>
                <div><dt>Subtotal ex VAT</dt><dd>{money(order.total?.subtotal_excl_tax)}</dd></div>
                {(order.total?.discounts || []).map((discount, index) => <div key={`${order.number}-discount-${index}`}><dt>{discount.label || "Discount"}</dt><dd>{money(discount.amount)}</dd></div>)}
                <div><dt>Delivery</dt><dd>{money(order.total?.total_shipping)}</dd></div>
                <div><dt>VAT</dt><dd>{money(order.total?.total_tax)}</dd></div>
                <div className="basket-grand-total"><dt>Grand total</dt><dd>{money(order.total?.grand_total)}</dd></div>
              </dl>
            </section>

            <section className="stack">
              <div>
                <h2>Repeat this order</h2>
                <p className="muted small">Fluid rebuilds only supported grouped-configurable rows against today’s company, Employee, stock and purchase rules. Rows needing intervention are reported instead of silently changed.</p>
              </div>
              <form action={repeatOrderAction}>
                <input type="hidden" name="order_number" value={order.number}/>
                <input type="hidden" name="page" value={page}/>
                <button className="button" type="submit">Repeat eligible items</button>
              </form>
            </section>

            <section className="stack">
              <div>
                <h2>Return enquiry</h2>
                <p className="muted small">Start a return request with this order number prefilled. Fluid accepts the request through the existing Css_Returns contact workflow; no eligibility or RMA status is inferred here.</p>
              </div>
              <div>
                <Link className="button secondary" href={`/account/returns?order=${encodeURIComponent(order.number)}`}>Request a return</Link>
              </div>
            </section>
          </div>
        </details>)}
      </div>}

      {orders.page_info.total_pages > 1 ? <nav className="pagination" aria-label="Order history pages">
        {page > 1 ? <Link className="button secondary" href={`/account/orders?page=${page - 1}`}>Previous</Link> : <span/>}
        <span className="muted">Page {page} of {orders.page_info.total_pages}</span>
        {page < orders.page_info.total_pages ? <Link className="button secondary" href={`/account/orders?page=${page + 1}`}>Next</Link> : <span/>}
      </nav> : null}
    </main>
  </>;
}
