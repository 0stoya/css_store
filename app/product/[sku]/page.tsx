import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { getProduct } from "@/lib/magento/product";
import { getRepeatOrderLists } from "@/lib/magento/repeat-orders";
import { requireCustomerToken } from "@/lib/session";
import { addProductToCartAction, saveProductToRepeatListAction } from "./actions";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

function constraintText(constraints: { minimum_quantity: number; maximum_quantity: number | null; quantity_increment: number; increments_enforced: boolean } | null) {
  if (!constraints) return null;
  const parts = [`Minimum ${constraints.minimum_quantity}`];
  if (constraints.maximum_quantity !== null) parts.push(`maximum ${constraints.maximum_quantity}`);
  if (constraints.increments_enforced) parts.push(`increments of ${constraints.quantity_increment}`);
  return parts.join(", ");
}

export const metadata = { title: "Product" };

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ added?: string; saved?: string; error?: string }>;
}) {
  const token = await requireCustomerToken();
  const [{ sku: rawSku }, status] = await Promise.all([params, searchParams]);
  const sku = decodeURIComponent(rawSku);
  const [product, ctx, employeeOrdering, repeatListsData] = await Promise.all([
    getProduct(token, sku),
    getCustomerContext(token),
    getEmployeeOrdering(token),
    getRepeatOrderLists(token),
  ]);
  if (!product) notFound();

  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const price = product.price_range?.minimum_price;
  const allowance = product.css_purchase_allowance;
  const allowanceBlocked = Boolean(allowance?.has_active_restriction && allowance.remaining_quantity <= 0);
  const grouped = product.__typename === "CssGroupedConfigurableProduct" || product.__typename === "GroupedProduct";
  const supported = ["SimpleProduct", "ConfigurableProduct", "CssGroupedConfigurableProduct", "GroupedProduct"].includes(product.__typename);
  const canAdd = !ctx.css_storefront_policy.hide_add_to_cart && product.css_stock_info.available && !allowanceBlocked && supported;
  const gallery = (product.media_gallery || []).filter((image) => Boolean(image.url)).sort((a, b) => (a.position || 0) - (b.position || 0));
  const repeatLists = repeatListsData.css_repeat_order_lists;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell">
      <Link className="back-link" href="/catalogue">← Back to products</Link>
      {status.added === "1" ? <p className="success">Added to basket.</p> : null}
      {status.saved === "1" ? <p className="success">Selection saved to the repeat-order list.</p> : null}
      {status.error ? <p className="error">{status.error}</p> : null}
      <section className="pdp">
        <div className="pdp-gallery card">
          {gallery[0] ? <img src={gallery[0].url} alt={gallery[0].label || product.name}/> : <div className="product-media"><span className="muted">No image</span></div>}
          {gallery.length > 1 ? <div className="thumb-row">{gallery.slice(1, 5).map((image) => <img key={image.url} src={image.url} alt={image.label || product.name}/>)}</div> : null}
        </div>
        <div className="pdp-info">
          <p className="eyebrow">{product.__typename.replace(/Product$/, " product")}</p>
          <h1>{product.name}</h1>
          <p className="muted">SKU {product.sku}</p>
          {!ctx.css_storefront_policy.hide_price && price ? <div className="pdp-price">
            <strong>{money(price.final_price.value, price.final_price.currency)}</strong>
            {price.regular_price.value > price.final_price.value ? <del>{money(price.regular_price.value, price.regular_price.currency)}</del> : null}
          </div> : null}
          <div className="notice-list">
            <p className={product.css_stock_info.available ? "notice" : "error"}>{product.css_stock_info.delivery_message || product.css_stock_info.stock_status}</p>
            {allowance?.has_active_restriction ? <p className="notice">Purchase allowance: {allowance.remaining_quantity} remaining of {allowance.allowed_quantity}; {allowance.purchased_quantity} already purchased.</p> : null}
            {product.css_purchase_constraints ? <p className="notice">Quantity rules: {constraintText(product.css_purchase_constraints)}.</p> : null}
          </div>
          {product.description?.html ? <div className="product-description" dangerouslySetInnerHTML={{ __html: product.description.html }}/> : null}
        </div>
      </section>

      <section className="card order-panel">
        <h2>Configure order</h2>
        {!supported ? <p className="error">This Magento product type does not yet have an accepted add-to-cart path.</p> : null}
        <form action={addProductToCartAction} className="stack">
          <input type="hidden" name="product_sku" value={product.sku}/>

          {product.__typename === "ConfigurableProduct" ? <div className="option-grid">
            {(product.configurable_options || []).map((option) => <label className="field" key={option.uid}>
              <span>{option.label}</span>
              <select name="selected_option" required defaultValue="">
                <option value="" disabled>Choose {option.label}</option>
                {option.values.map((value) => <option key={value.uid} value={value.uid}>{value.label}</option>)}
              </select>
            </label>)}
          </div> : null}

          {product.__typename === "SimpleProduct" || product.__typename === "ConfigurableProduct" ? <label className="field quantity-field">
            <span>Quantity</span>
            <input
              name="quantity"
              type="number"
              defaultValue={Math.max(1, product.css_purchase_constraints?.minimum_quantity || 1)}
              min={product.css_purchase_constraints?.minimum_quantity || 1}
              max={product.css_purchase_constraints?.maximum_quantity ?? undefined}
              step={product.css_purchase_constraints?.increments_enforced ? product.css_purchase_constraints.quantity_increment : "any"}
              required
            />
          </label> : null}

          {grouped ? <div className="grouped-lines">
            {(product.items || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0)).map((item, index) => {
              const child = item.product;
              const childPrice = child.price_range?.minimum_price.final_price;
              const childAllowanceBlocked = Boolean(child.css_purchase_allowance?.has_active_restriction && child.css_purchase_allowance.remaining_quantity <= 0);
              const childAvailable = child.css_stock_info.available && !childAllowanceBlocked;
              return <div className="grouped-line" key={child.uid}>
                <input type="hidden" name={`child_${index}_sku`} value={child.sku}/>
                <div>
                  <strong>{child.name}</strong>
                  <div className="muted">{child.sku}{childPrice && !ctx.css_storefront_policy.hide_price ? ` · ${money(childPrice.value, childPrice.currency)}` : ""}</div>
                  <div className="badge">{child.__typename === "ConfigurableProduct" ? "Configurable option" : "Grouped option"}</div>
                </div>
                {(child.configurable_options || []).map((option) => <label className="field" key={option.uid}>
                  <span>{option.label}</span>
                  <select name={`child_${index}_option`} defaultValue="" disabled={!childAvailable}>
                    <option value="" disabled>Choose</option>
                    {option.values.map((value) => <option value={value.uid} key={value.uid}>{value.label}</option>)}
                  </select>
                </label>)}
                <label className="field compact-field"><span>Qty</span><input
                  name={`child_${index}_quantity`}
                  type="number"
                  min="0"
                  max={child.css_purchase_constraints?.maximum_quantity ?? undefined}
                  step={child.css_purchase_constraints?.increments_enforced ? child.css_purchase_constraints.quantity_increment : "any"}
                  defaultValue={item.qty && item.qty > 0 ? item.qty : 0}
                  disabled={!childAvailable}
                /></label>
                <div className="muted small">
                  {childAvailable ? child.css_stock_info.delivery_message : (child.css_purchase_allowance?.has_active_restriction && child.css_purchase_allowance.remaining_quantity <= 0 ? "No remaining purchase allowance" : child.css_stock_info.delivery_message)}
                  {child.css_purchase_constraints ? ` · ${constraintText(child.css_purchase_constraints)}` : ""}
                </div>
              </div>;
            })}
            {!product.items?.length ? <p className="error">Magento has not returned any orderable children for this grouped product.</p> : null}
          </div> : null}

          {employeeOrdering.usesEmployee && employeeOrdering.multiEmployeeBasket ? <label className="field employee-field">
            <span>Employee</span>
            <select name="employee_id" required defaultValue="">
              <option value="" disabled>Choose Employee</option>
              {employeeOrdering.employees.map((employee) => <option value={employee.employee_id} key={employee.employee_id}>
                {employee.full_name}{employee.employee_code ? ` · ${employee.employee_code}` : ""}{employee.department ? ` · ${employee.department}` : ""}
              </option>)}
            </select>
            <small className="muted">Employee attribution is stored per basket line.</small>
          </label> : null}

          {employeeOrdering.usesEmployee && !employeeOrdering.multiEmployeeBasket ? <p className="notice">
            This company uses one Employee for the whole order. You will choose that Employee as the first checkout step.
          </p> : null}

          {product.__typename === "CssGroupedConfigurableProduct" ? <div className="card stack" style={{padding:16}}>
            <div>
              <strong>Save this configuration</strong>
              <p className="muted small">The same validated variant SKUs and quantities can be stored as a Fluid repeat-order list. Multi-Employee baskets also preserve the selected Employee for each saved row.</p>
            </div>
            {repeatLists.length ? <>
              <label className="field">
                <span>Repeat-order list</span>
                <select name="repeat_list_id" defaultValue="">
                  <option value="" disabled>Choose a list</option>
                  {repeatLists.map((list) => <option key={list.list_id} value={list.list_id}>{list.name}</option>)}
                </select>
              </label>
              <button
                className="button secondary"
                type="submit"
                formAction={saveProductToRepeatListAction}
                disabled={!canAdd || !product.items?.length}
              >Save selection to repeat list</button>
            </> : <p className="muted small">No repeat lists yet. <Link href="/account/repeat-orders">Create one in your account</Link>.</p>}
          </div> : null}

          <button className="button" type="submit" disabled={!canAdd || (grouped && !product.items?.length)}>
            {canAdd && (!grouped || product.items?.length) ? (ctx.css_storefront_policy.add_to_cart_label || "Add to basket") : "Ordering unavailable"}
          </button>
        </form>
      </section>
    </main>
  </>;
}
