import Link from "next/link";
import type { StoreProduct } from "@/lib/magento/catalogue";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

export function ProductCard({ product, hidePrice }: { product: StoreProduct; hidePrice: boolean }) {
  const price = product.price_range?.minimum_price;
  const restricted = product.css_purchase_allowance?.has_active_restriction === true;
  const available = product.css_stock_info.available;
  const stockLabel = product.css_stock_info.stock_status || product.stock_status || (available ? "Available" : "Unavailable");

  return <article className="card product">
    <Link className="product-link" href={`/product/${encodeURIComponent(product.sku)}`}>
      <div className="product-media">
        {product.small_image?.url
          ? <img src={product.small_image.url} alt={product.small_image.label || product.name}/>
          : <span className="muted">No product image</span>}
      </div>
      <div className="product-body">
        <span className={`product-stock ${available ? "available" : "unavailable"}`}>{stockLabel}</span>
        <span className="product-title">{product.name}</span>
        <span className="product-sku">SKU {product.sku}</span>

        {!hidePrice && price ? <div className="product-price-row">
          <span className="price">{money(price.final_price.value, price.final_price.currency)}</span>
        </div> : null}

        {restricted ? <span className="product-card-note restricted">
          Purchase allowance: {product.css_purchase_allowance?.remaining_quantity} remaining
        </span> : null}
        {product.css_stock_info.delivery_message ? <span className="product-card-note">{product.css_stock_info.delivery_message}</span> : null}

        <span className="product-card-footer">
          <span>View product</span>
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  </article>;
}
