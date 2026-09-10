import Link from "next/link";

type CheckoutStep = "employee" | "delivery" | "payment";

export function CheckoutSteps({
  current,
  includeEmployee,
}: {
  current: CheckoutStep;
  includeEmployee: boolean;
}) {
  const steps: Array<{ key: CheckoutStep; label: string; href: string }> = [
    ...(includeEmployee ? [{ key: "employee" as const, label: "Employee", href: "/checkout/employee" }] : []),
    { key: "delivery", label: "Delivery", href: "/checkout/delivery" },
    { key: "payment", label: "Payment & review", href: "/checkout/payment" },
  ];
  const currentIndex = steps.findIndex((step) => step.key === current);

  return <nav aria-label="Checkout progress">
    <ol className="checkout-progress" style={{ "--checkout-step-count": steps.length } as React.CSSProperties}>
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const className = index === currentIndex ? "current" : complete ? "complete" : "";
        const content = <>
          <span className="checkout-step-number" aria-hidden="true">{complete ? "✓" : index + 1}</span>
          <span>{step.label}</span>
        </>;
        return <li className={className} key={step.key} aria-current={index === currentIndex ? "step" : undefined}>
          {complete ? <Link href={step.href}>{content}</Link> : content}
        </li>;
      })}
    </ol>
  </nav>;
}
