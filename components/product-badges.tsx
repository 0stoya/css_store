import {
  BadgeCheck,
  Clock3,
  Printer,
  ShieldCheck,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react";
import {
  getActiveProductBadgeCodes,
  type ProductBadgeCode,
  type ProductBadgeValues,
} from "@/lib/product-badges";

const BADGES: Record<ProductBadgeCode, {
  label: string;
  Icon: typeof ShieldCheck;
}> = {
  ppe_certified: { label: "Certified PPE", Icon: ShieldCheck },
  express_delivery: { label: "Express delivery", Icon: Zap },
  fast_delivery: { label: "Fast delivery", Icon: Truck },
  made_to_order: { label: "Made to order", Icon: Clock3 },
  company_logo: { label: "Company logo", Icon: BadgeCheck },
  embroidered: { label: "Embroidered", Icon: Sparkles },
  printed: { label: "Printed logo", Icon: Printer },
};

export function ProductBadges({
  values,
  compact = false,
}: {
  values: ProductBadgeValues | undefined;
  compact?: boolean;
}) {
  const codes = getActiveProductBadgeCodes(values);
  const visible = compact ? codes.slice(0, 2) : codes;

  if (!visible.length) return null;

  return <div className={`product-badges${compact ? " compact" : ""}`} aria-label="Product features">
    {visible.map((code) => {
      const { label, Icon } = BADGES[code];
      return <span className={`product-badge product-badge-${code}`} key={code}>
        <Icon size={compact ? 13 : 15} strokeWidth={2.15} aria-hidden="true"/>
        <span>{label}</span>
      </span>;
    })}
  </div>;
}
