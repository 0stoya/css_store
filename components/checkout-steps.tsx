import Link from "next/link";
import { Check } from "lucide-react";
import type { CSSProperties } from "react";

type CheckoutStep = "delivery" | "payment";

type CheckoutStyle = CSSProperties & { "--checkout-step-count": number };

export function CheckoutSteps({
  current,
}: {
  current: CheckoutStep;
}) {
  const steps: Array<{ key: CheckoutStep; label: string; href: string }> = [
    { key: "delivery", label: "Delivery & details", href: "/checkout/delivery" },
    { key: "payment", label: "Review & submit", href: "/checkout/payment" },
  ];
  const currentIndex = steps.findIndex((step) => step.key === current);
  const style: CheckoutStyle = { "--checkout-step-count": steps.length };

  return <nav aria-label="Checkout progress">
    <ol className="checkout-progress" style={style}>
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const className = index === currentIndex ? "current" : complete ? "complete" : "";
        const content = <>
          <span className="checkout-step-number" aria-hidden="true">{complete ? <Check size={14} strokeWidth={2.5}/> : index + 1}</span>
          <span>{step.label}</span>
        </>;

        return <li className={className} key={step.key} aria-current={index === currentIndex ? "step" : undefined}>
          {complete ? <Link href={step.href}>{content}</Link> : content}
        </li>;
      })}
    </ol>
  </nav>;
}
