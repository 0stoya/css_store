import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileText,
  Repeat2,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { EmployeePicker } from "@/components/employee-picker";
import { ProductGallery } from "@/components/product-gallery";
import { QuantityStepper } from "@/components/quantity-stepper";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { getProduct } from "@/lib/magento/product";
import { getRepeatOrderLists } from "@/lib/magento/repeat-orders";
import { requireCustomerToken } from "@/lib/session";
import { addProductToCartAction, saveProductToRepeatListAction } from "./actions";
import { addGroupedChildToCartAction } from "./grouped-actions";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
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
  const configurable = product.__typename === "ConfigurableProduct";
  const supported = ["SimpleProduct", "ConfigurableProduct", "CssGroupedConfigurableProduct", "GroupedProduct"].includes(product.__typename);
  const canAdd = !ctx.css_storefront_policy.hide_add_to_cart && product.css_stock_info.available && !allowanceBlocked && supported;
  const gallery = (product.media_gallery || []).filter((image) => Boolean(image.url)).sort((a, b) => (a.position || 0) - (b.position || 0));
  const repeatLists = repeatListsData.css_repeat_order_lists;
  const stockLabel = product.css_stock_info.stock_status || (product.css_stock_info.available ? "Available" : "Unavailable");
  const productTypeLabel = grouped ? "Product set" : configurable ? "Choose your options" : "Product";
  const addLabel = ctx.css_storefront_policy.add_to_cart_label || "Add to basket";

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell pdp-page">
      <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
        <Link href="/catalogue">Products</Link>
        <ChevronRight size={15} aria-hidden="true"/>
        <span aria-current="page">{product.name}</span>
      </nav>

      {status.added === "1" ? <p className="success pdp-message" role="status">Added to basket.</p> : null}
      {status.saved === "1" ? <p className="success pdp-message" role="status">Selection saved to your repeat-order list.</p> : null}
      {status.error ? <p className="error pdp-message" role="alert">{status.error}</p> : null}

      <section className="pdp pdp-hero">
        <div className="pdp-gallery card">
          <ProductGallery
            images={gallery.map((image) => ({ url: image.url, label: image.label }))}
            productName={product.name}
          />
        </div>

        <div className="pdp-info">
          <p className="eyebrow">{productTypeLabel}</p>
          <h1>{product.name}</h1>
          <div className="pdp-meta-row">
            <span className="pdp-sku">SKU {product.sku}</span>
            <span className={`product-stock ${product.css_stock_info.available ? "available" : "unavailable"}`}>{stockLabel}</span>
          </div>

          {!ctx.css_storefront_policy.hide_price && price ? <div className="pdp-price-card">
            <div>
              <span className="pdp-price-label">Your price</span>
              <strong className="pdp-price-value">{money(price.final_price.value, price.final_price.currency)}</strong>
              {price.regular_price.value > price.final_price.value ? <del>{money(price.regular_price.value, price.regular_price.currency)}</del> : null}
            </div>
          </div> : null}

          <div className="pdp-status-grid">
            {product.css_stock_info.delivery_message ? <div className={`pdp-status-card ${product.css_stock_info.available ? "positive" : "blocked"}`}>
              <Truck size={19} aria-hidden="true"/>
              <div><strong>Delivery</strong><span>{product.css_stock_info.delivery_message}</span></div>
            </div> : null}

            {allowance?.has_active_restriction ? <div className={`pdp-status-card ${allowanceBlocked ? "blocked" : ""}`}>
              <CircleAlert size={19} aria-hidden="true"/>
              <div><strong>Purchase allowance</strong><span>{allowance.remaining_quantity} remaining of {allowance.allowed_quantity}</span></div>
            </div> : null}
          </div>

          {product.description?.html ? <details className="pdp-description-card" open>
            <summary>
              <span><FileText size={18} aria-hidden="true"/>Product details</span>
              <ChevronDown className="pdp-description-chevron" size={18} aria-hidden="true"/>
            </summary>
            <div className="product-description" dangerouslySetInnerHTML={{ __html: product.description.html }}/>
          </details> : null}
        </div>
      </section>

      <section className="card order-panel pdp-order-panel">
        <div className="order-panel-header">
          <div>
            <p className="eyebrow">Order this product</p>
            <h2>{grouped ? "Build your order" : configurable ? "Choose your options" : "Choose a quantity"}</h2>
          </div>
          <p>{grouped
            ? "Choose the product and quantity you need, then add that line to your basket."
            : configurable
              ? "Select the product options and quantity you need."
              : "Choose how many you need, then add the item to your basket."}</p>
        </div>

        {!supported ? <p className="error" role="alert">This product can’t currently be ordered online.</p> : null}

        <form action={grouped ? addGroupedChildToCartAction : addProductToCartAction} className={`pdp-order-form ${grouped ? "grouped-order-form" : "single-order-form"}`}>
          <input type="hidden" name="product_sku" value={product.sku}/>

          <div className="pdp-order-main stack">
            {configurable ? <section className="pdp-option-section">
              <div className="pdp-option-heading">
                <strong>Product options</strong>
                <span>Choose one value for each option.</span>
              </div>
              <div className="option-grid">
                {(product.configurable_options || []).map((option) => <label className="field" key={option.uid}>
                  <span>{option.label}</span>
                  <select name="selected_option" required defaultValue="">
                    <option value="" disabled>Choose {option.label}</option>
                    {option.values.map((value) => <option key={value.uid} value={value.uid}>{value.label}</option>)}
                  </select>
                </label>)}
              </div>
            </section> : null}

            {employeeOrdering.usesEmployee && employeeOrdering.multiEmployeeBasket ? <section className="pdp-option-section pdp-employee-section">
              <div className="pdp-option-heading">
                <strong>Who is this for?</strong>
              </div>
              <EmployeePicker employees={employeeOrdering.employees}/>
            </section> : null}

            {product.__typename === "SimpleProduct" || configurable ? <section className="pdp-option-section pdp-single-quantity-section">
              <QuantityStepper
                name="quantity"
                defaultValue={Math.max(1, product.css_purchase_constraints?.minimum_quantity || 1)}
                min={product.css_purchase_constraints?.minimum_quantity || 1}
                max={product.css_purchase_constraints?.maximum_quantity ?? undefined}
                step={product.css_purchase_constraints?.increments_enforced ? product.css_purchase_constraints.quantity_increment : "any"}
              />
            </section> : null}

            {grouped ? <section className="pdp-option-section grouped-section">
              <div className="pdp-option-heading">
                <strong>Products in this set</strong>
              </div>
              <div className="grouped-lines" aria-label="Grouped product options">
                {(product.items || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0)).map((item, index) => {
                  const child = item.product;
                  const childPrice = child.price_range?.minimum_price.final_price;
                  const childAllowanceBlocked = Boolean(child.css_purchase_allowance?.has_active_restriction && child.css_purchase_allowance.remaining_quantity <= 0);
                  const childAvailable = child.css_stock_info.available && !childAllowanceBlocked;
                  return <article className={`grouped-line pdp-grouped-line ${childAvailable ? "" : "unavailable"}`} key={child.uid}>
                    <input type="hidden" name={`child_${index}_sku`} value={child.sku}/>
                    <div className="grouped-product-name">
                      <div className="pdp-grouped-title-row">
                        <strong>{child.name}</strong>
                        {!ctx.css_storefront_policy.hide_price && childPrice ? <span className="pdp-grouped-price">{money(childPrice.value, childPrice.currency)}</span> : null}
                      </div>
                      {!childAvailable ? <span className="product-stock unavailable">Unavailable</span> : null}
                    </div>

                    {(child.configurable_options || []).length ? <div className="pdp-grouped-options">
                      {(child.configurable_options || []).map((option) => <label className="field" key={option.uid}>
                        <span>{option.label}</span>
                        <select name={`child_${index}_option`} defaultValue="" disabled={!childAvailable}>
                          <option value="" disabled>Choose {option.label}</option>
                          {option.values.map((value) => <option value={value.uid} key={value.uid}>{value.label}</option>)}
                        </select>
                      </label>)}
                    </div> : null}

                    <QuantityStepper
                      name={`child_${index}_quantity`}
                      label="Quantity"
                      ariaLabel={`${child.name} quantity`}
                      defaultValue={0}
                      min={0}
                      max={child.css_purchase_constraints?.maximum_quantity ?? undefined}
                      step={child.css_purchase_constraints?.increments_enforced ? child.css_purchase_constraints.quantity_increment : 1}
                      disabled={!childAvailable}
                      compact
                      submitControl={{
                        name: "grouped_child_sku",
                        value: child.sku,
                        label: "Add",
                        disabled: !canAdd || !childAvailable,
                      }}
                    />
                  </article>;
                })}
                {!product.items?.length ? <p className="error" role="alert">There are no orderable options available for this product.</p> : null}
              </div>
            </section> : null}

            {employeeOrdering.usesEmployee && !employeeOrdering.multiEmployeeBasket ? <p className="pdp-checkout-note">
              Employee selection happens at the start of checkout.
            </p> : null}

            {product.__typename === "CssGroupedConfigurableProduct" ? <section className="repeat-save-card pdp-repeat-card stack">
              <div className="pdp-repeat-heading">
                <Repeat2 size={19} aria-hidden="true"/>
                <div>
                  <strong>Save for next time</strong>
                  <p className="muted small">Save the quantities and options currently shown to one of your repeat-order lists.</p>
                </div>
              </div>
              {repeatLists.length ? <div className="pdp-repeat-actions">
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
                >Save selection</button>
              </div> : <p className="muted small">No repeat lists yet. <Link href="/account/repeat-orders">Create one in your account</Link>.</p>}
            </section> : null}

            {!grouped ? <div className="pdp-primary-row">
              <button className="button order-primary-action" type="submit" disabled={!canAdd}>
                <ShoppingCart size={19} aria-hidden="true"/>
                <span>{canAdd ? addLabel : "Ordering unavailable"}</span>
              </button>
              {!canAdd ? <p className="pdp-order-unavailable">
                <CircleAlert size={16} aria-hidden="true"/>
                <span>This product can’t currently be added to the basket.</span>
              </p> : null}
            </div> : null}
          </div>
        </form>
      </section>
    </main>
  </>;
}
