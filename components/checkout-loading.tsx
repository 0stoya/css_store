import { LoaderCircle } from "lucide-react";

export function CheckoutLoading({ label }: { label: string }) {
  return <main className="shell checkout-loading-page">
    <div className="checkout-loading-status" role="status">
      <LoaderCircle className="checkout-loading-spinner" size={20} aria-hidden="true" />
      <span>{label}</span>
    </div>
  </main>;
}
