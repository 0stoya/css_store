import Link from "next/link";
import { CalendarDays, ChevronDown, RotateCcw, ShoppingCart } from "lucide-react";
import { CataloguePagination } from "@/components/catalogue-pagination";
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
  const companyScope = data.css_ordering_capabilities.can_view_company_orders;

  return <section className="account-workspace-content stack">
    <header className="account-workspace-heading">
      <p className="eyebrow">Account</p>
      <h1>Order history</h1>
      <p className="muted">
        {companyScope
          ? `Orders available to you across ${selectedCompany?.name || "the selected company"}.`
          : `Your orders for ${selectedCompany?.name || "the selected company"}.`}
      </p>
    </header>

    {params.error ? <p className="error" role="alert">{params.error}</p> : null}
    {params.warning ? <p className="error" role="alert">{params.warning}</p> : null}
    {params.notice ? <p className="success" role="status">{params.notice}</p> : null}

    <div className={styles.toolbar}>
      <div>
        <strong>{orders.total_count} {orders.total_count === 1 ? "order" : "orders"}</strong>
        <span>{selectedCompany?.name || "Current company"}</span>
      </div>
      <span className="badge">{companyScope ? "Company orders" : "My orders"}</span>
    </div>

    {!orders.items.length ? <section className="empty card">
      <h2>No orders yet</h2>
      <p className="muted">There are no orders available for this company yet.</p>
      <p><Link className="button" href="/catalogue">Browse products</Link></p>
    </section> : <div className={styles.list}>
      {orders.items.map((order) => <details className={`card ${styles.card}`} key={order.number}>
        <summary className={styles.summary}>
          <div className={styles.summaryPrimary}>
            <span className={styles.orderNumber}>Order {order.number}</span>
            <span className={styles.orderDate}><CalendarDays size={15} aria-hidden="true"/>{order.order_date}</span>
          </div>
          <div className={styles.summaryMeta}>
            <span className="badge">{order.status}</span>
            <strong>{money(order.total?.grand_total)}</strong>
            <span className={styles.viewLabel}>Details</span>
            <ChevronDown className={styles.summaryChevron} size={18} aria-hidden="true"/>
          </div>
        </summary>

        <div className={`${styles.detail} stack`}>
          <section>
            <div className={styles.sectionHeading}>
              <h2>Items</h2>
              <span className="muted small">{order.items?.length || 0} line{(order.items?.length || 0) === 1 ? "" : "s"}</span>
            </div>
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

          <div className={styles.detailFooter}>
            <section className={styles.orderActionsCard}>
              <h2>Order actions</h2>
              <div className={styles.orderActionButtons}>
                <form action={repeatOrderAction}>
                  <input type="hidden" name="order_number" value={order.number}/>
                  <input type="hidden" name="page" value={page}/>
                  <button className="button" type="submit"><ShoppingCart size={16} aria-hidden="true"/>Repeat eligible items</button>
                </form>
                <Link className="button secondary" href={`/account/returns?order=${encodeURIComponent(order.number)}`}>
                  <RotateCcw size={16} aria-hidden="true"/>Request a return
                </Link>
              </div>
              <p className="muted small">Repeat ordering always uses today’s availability and purchasing rules.</p>
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
          </div>
        </div>
      </details>)}
    </div>}

    <CataloguePagination
      currentPage={page}
      totalPages={orders.page_info.total_pages}
      href={(targetPage) => `/account/orders${targetPage > 1 ? `?page=${targetPage}` : ""}`}
      label="Order history pages"
    />
  </section>;
}
