import { SiteHeader } from "@/components/site-header";
import { getProducts } from "@/lib/magento/catalogue";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";

export const metadata = { title: "Products" };

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const token = await requireCustomerToken();
  const [{ q = "" }, ctx] = await Promise.all([searchParams, getCustomerContext(token)]);
  const products = await getProducts(token, q.trim());
  const selected = ctx.css_company_context.companies.find((c) => c.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  return <><SiteHeader customerName={name} companyName={selected?.name}/><main className="shell"><div className="toolbar"><div><p className="eyebrow">Company catalogue</p><h1 style={{fontSize:"2.6rem"}}>Products</h1><p className="muted">{products.total_count} products available in the current Magento catalogue response.</p></div><form className="search"><input name="q" type="search" defaultValue={q} placeholder="Search products"/><button className="button secondary" type="submit">Search</button></form></div><section className="product-grid">{products.items.map((product)=>{const price=product.price_range?.minimum_price.final_price;return <article className="card product" key={product.uid}><div className="product-media">{product.small_image?.url ? <img src={product.small_image.url} alt={product.small_image.label || product.name}/> : <span className="muted">No image</span>}</div><div className="product-body"><span className="badge">{product.stock_status || "Unknown stock"}</span><strong>{product.name}</strong><span className="muted">{product.sku}</span>{!ctx.css_storefront_policy.hide_price && price ? <span className="price">{new Intl.NumberFormat("en-GB",{style:"currency",currency:price.currency}).format(price.value)}</span> : <span className="muted">Price available after enquiry</span>}</div></article>})}</section></main></>;
}
