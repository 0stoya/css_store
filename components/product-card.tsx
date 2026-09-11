import { ArrowRight, Hash, PackageCheck, PackageX, ShieldAlert, Truck } from "lucide-react";
import Link from "next/link";
import type { StoreProduct } from "@/lib/magento/catalogue";
import { ProductImage } from "./product-image";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

export function ProductCard({ product, hidePrice }: { product: StoreProduct; hidePrice: boolean }) {
  const price = product.price_range?.minimum_price;
  const restricted = product.css_purchase_allowance?.has_active_restriction === true;
  const available = product.css_stock_info.available;
  const stockLabel = product.css_stock_info.stock_status || product.stock_status || (available ? "Available" : "Unavailable");
  const StockIcon = available ? PackageCheck : PackageX;

  return <article className="card product">
    <Link className="product-link" href={`/product/${encodeURIComponent(product.sku)}`}>
      <div className="product-media">
        <ProductImage src={product.small_image?.url} alt={product.small_image?.label || product.name}/>
      </div>
      <div className="product-body">
        <div className="product-card-meta">
          <span className={`product-stock ${available ? "available" : "unavailable"}`}>
            <StockIcon size={14} strokeWidth={2.2} aria-hidden="true"/>
            <span>{stockLabel}</span>
          </span>
          <span className="product-sku">
            <Hash size={13} strokeWidth={2} aria-hidden="true"/>
            <span>{product.sku}</span>
          </span>
        </div>

        <h3 className="product-title">{product.name}</h3>

        {!hidePrice && price ? <div className="product-price-row">
          <span className="product-price-label">Your price</span>
          <span className="price">{money(price.final_price.value, price.final_price.currency)}</span>
        </div> : null}

        <div className="product-card-notes">
          {restricted ? <span className="product-card-note restricted">
            <ShieldAlert size={15} strokeWidth={2} aria-hidden="true"/>
            <span>Purchase allowance: {product.css_purchase_allowance?.remaining_quantity} remaining</span>
          </span> : null}
          {product.css_stock_info.delivery_message ? <span className="product-card-note">
            <Truck size={15} strokeWidth={2} aria-hidden="true"/>
            <span>{product.css_stock_info.delivery_message}</span>
          </span> : null}
        </div>

        <span className="product-card-footer">
          <span>View product</span>
          <ArrowRight size={17} strokeWidth={2.2} aria-hidden="true"/>
        </span>
      </div>
    </Link>
  </article>;
}
