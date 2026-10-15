import { Layers, Package, ShieldCheck } from "lucide-react";
import {
  getProductSpecificationSections,
  type ProductSpecificationSection,
  type ProductSpecificationValues,
} from "@/lib/product-specifications";

const SECTION_ICONS: Record<ProductSpecificationSection["code"], typeof ShieldCheck> = {
  safety: ShieldCheck,
  materials: Layers,
  packaging: Package,
};

export function ProductSpecifications({
  values,
}: {
  values: ProductSpecificationValues | undefined | null;
}) {
  const sections = getProductSpecificationSections(values);
  if (!sections.length) return null;

  return <section className="pdp-specifications-section" aria-labelledby="pdp-specifications-heading">
    <header className="pdp-specifications-heading">
      <div>
        <p className="eyebrow">Product information</p>
        <h2 id="pdp-specifications-heading">Specifications</h2>
      </div>
    </header>

    <div className="pdp-specifications-grid">
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section.code];
        const sectionId = "pdp-specifications-" + section.code;
        return <section
          className="card pdp-specifications-card"
          key={section.code}
          aria-labelledby={sectionId}
        >
          <div className="pdp-specifications-card-heading">
            <span className="pdp-specifications-icon"><Icon size={20} strokeWidth={1.9} aria-hidden="true"/></span>
            <h3 id={sectionId}>{section.title}</h3>
          </div>
          <dl className="pdp-specifications-rows">
            {section.entries.map(({ code, label, value }) => <div className="pdp-specifications-row" key={code}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>)}
          </dl>
          {section.code === "packaging" ? <p className="pdp-specifications-note">
            Packaging quantities are informational; ordering limits are shown above.
          </p> : null}
        </section>;
      })}
    </div>
  </section>;
}
