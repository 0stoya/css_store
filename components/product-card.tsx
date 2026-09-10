import type { StoreProduct } from "@/lib/magento/catalogue";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

export function ProductCard({ product, hidePrice }: { product: StoreProduct; hidePrice: boolean }) {
  const price = product.price_range?.minimum_price;
  const restricted = product.css_purchase_allowance?.has_active_restriction === true;
  return <article className="card product">
    <a className="product-link" href={`/product/${encodeURIComponent(product.sku)}`}>
      <div className="product-media">
        {product.small_image?.url ? <img src={product.small_image.url} alt={product.small_image.label || product.name}/> : <span className="muted">No image</span>}
      </div>
      <div className="product-body">
        <span className="badge">{product.css_stock_info.stock_status || product.stock_status || "Unknown stock"}</span>
        <strong>{product.name}</strong>
        <span className="muted">{product.sku}</span>
        {!hidePrice && price ? <span className="price">{money(price.final_price.value, price.final_price.currency)}</span> : <span className="muted">Price hidden by storefront policy</span>}
        {restricted ? <span className="muted small">Allowance: {product.css_purchase_allowance?.remaining_quantity} remaining</span> : null}
        {product.css_stock_info.delivery_message ? <span className="muted small">{product.css_stock_info.delivery_message}</span> : null}
      </div>
    </a>
  </article>;
}
