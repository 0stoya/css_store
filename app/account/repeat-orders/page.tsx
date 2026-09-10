import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { getRepeatOrderLists } from "@/lib/magento/repeat-orders";
import { requireCustomerToken } from "@/lib/session";
import {
  addRepeatOrderListToCartAction,
  createRepeatOrderListAction,
  deleteRepeatOrderListAction,
  deleteRepeatOrderListItemAction,
  updateRepeatOrderListAction,
} from "./actions";

export const metadata = { title: "Repeat orders" };

export default async function RepeatOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; warning?: string }>;
}) {
  const token = await requireCustomerToken();
  const [ctx, data, messages] = await Promise.all([
    getCustomerContext(token),
    getRepeatOrderLists(token),
    searchParams,
  ]);
  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const lists = data.css_repeat_order_lists;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell stack">
      <header className="portal-page-header">
        <div className="portal-page-heading">
          <p className="eyebrow">Account</p>
          <h1>Repeat orders</h1>
          <p className="muted">Save frequently ordered product configurations and add eligible items back to your basket quickly.</p>
        </div>
        <Link className="button secondary" href="/account">Back to account</Link>
      </header>

      {messages.error ? <p className="error" role="alert">{messages.error}</p> : null}
      {messages.warning ? <p className="error" role="alert">{messages.warning}</p> : null}
      {messages.notice ? <p className="success" role="status">{messages.notice}</p> : null}

      <section className="card stack" style={{padding:24}}>
        <div>
          <p className="account-card-kicker">New list</p>
          <h2>Create a repeat-order list</h2>
          <p className="muted small">Create a list here, then save eligible configured products to it from their product page.</p>
        </div>
        <form action={createRepeatOrderListAction} className="stack">
          <label className="field">
            <span>List name</span>
            <input name="name" required maxLength={255}/>
          </label>
          <label className="field">
            <span>Description <span className="muted">(optional)</span></span>
            <textarea name="description" rows={2}/>
          </label>
          <div><button className="button" type="submit">Create list</button></div>
        </form>
      </section>

      {!lists.length ? <section className="empty card">
        <h2>No repeat-order lists yet</h2>
        <p className="muted">Create your first list above, then save an eligible configured product from the catalogue.</p>
      </section> : lists.map((list) => <section className="card stack" style={{padding:24}} key={list.list_id}>
        <div className="basket-heading">
          <div>
            <p className="account-card-kicker">Saved list</p>
            <h2>{list.name}</h2>
            {list.description ? <p className="muted">{list.description}</p> : null}
            {list.updated_at ? <p className="muted small">Updated {list.updated_at}</p> : null}
          </div>
          <span className="badge">{list.items.length} {list.items.length === 1 ? "item" : "items"}</span>
        </div>

        <details>
          <summary><strong>Edit list details</strong></summary>
          <form action={updateRepeatOrderListAction} className="stack" style={{marginTop:16}}>
            <input type="hidden" name="list_id" value={list.list_id}/>
            <label className="field">
              <span>Name</span>
              <input name="name" required defaultValue={list.name}/>
            </label>
            <label className="field">
              <span>Description</span>
              <textarea name="description" rows={2} defaultValue={list.description || ""}/>
            </label>
            <div><button className="button secondary" type="submit">Save changes</button></div>
          </form>
        </details>

        {list.items.length ? <form className="stack">
          <input type="hidden" name="list_id" value={list.list_id}/>
          <div className="company-list">
            {list.items.map((item) => <div className="company-row" key={item.item_id}>
              <label style={{display:"flex", gap:12, alignItems:"flex-start", flex:1}}>
                <input type="checkbox" name="item_id" value={item.item_id} disabled={!item.compatible}/>
                <span>
                  <strong>{item.variant_sku || item.sku}</strong>
                  <span className="muted small" style={{display:"block"}}>
                    {item.parent_sku ? `Parent ${item.parent_sku} · ` : ""}{item.configurable_sku ? `Configured ${item.configurable_sku} · ` : ""}Qty {item.quantity}
                  </span>
                  {item.employee_name ? <span className="muted small" style={{display:"block"}}>Employee: {item.employee_name}</span> : null}
                  <span className={item.compatible ? "success" : "error"} style={{display:"block", marginTop:6}}>
                    {item.compatible ? "Ready to order" : `Needs attention: ${item.reason || "this saved selection is no longer available"}`}
                  </span>
                </span>
              </label>
              <button
                className="button secondary"
                type="submit"
                formAction={deleteRepeatOrderListItemAction}
                name="delete_item_id"
                value={item.item_id}
              >Remove</button>
            </div>)}
          </div>
          <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
            <button className="button" type="submit" formAction={addRepeatOrderListToCartAction} name="mode" value="all">Add all available items</button>
            <button className="button secondary" type="submit" formAction={addRepeatOrderListToCartAction} name="mode" value="selected">Add selected</button>
          </div>
          <p className="muted small">Saved items are checked against current availability and ordering rules before they are added. Your existing basket is kept.</p>
        </form> : <p className="muted">This list is empty. Save an eligible configured product from its product page.</p>}

        <form action={deleteRepeatOrderListAction}>
          <input type="hidden" name="list_id" value={list.list_id}/>
          <button className="button secondary" type="submit">Delete list</button>
        </form>
      </section>)}
    </main>
  </>;
}
