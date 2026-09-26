import Link from "next/link";
import { ArrowRight, CircleCheckBig, Clock3 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";

export const metadata = { title: "Order confirmation" };

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    order?: string;
    credit?: string;
    status?: string;
    approval?: string;
    auto?: string;
    placed?: string;
  }>;
}) {
  const token = await requireCustomerToken();
  const [ctx, result] = await Promise.all([getCustomerContext(token), searchParams]);
  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const isCredit = result.kind === "credit" && Boolean(result.credit);
  const isNativeOrder = result.kind === "order" && Boolean(result.order);
  const hasResult = isCredit || isNativeOrder;
  const approvalRequired = result.approval === "1";
  const orderPlaced = result.placed === "1";

  let heading = hasResult ? "Order submitted" : "No checkout result";
  let explanation = hasResult
    ? "Your order has been submitted successfully."
    : "This page does not contain a completed checkout result. Return to your basket or catalogue to continue.";

  if (isCredit && approvalRequired) {
    heading = "Order submitted for approval";
    explanation = "Your order has been sent through your company approval workflow. You can follow its status from your account.";
  } else if (isCredit && orderPlaced) {
    heading = "Order placed";
    explanation = "Your order has been placed successfully and is now being processed.";
  } else if (isCredit) {
    heading = "Order submitted";
    explanation = "Your order has been submitted. Its current status is shown below.";
  }

  const success = hasResult && (!approvalRequired || orderPlaced);
  const ResultIcon = approvalRequired && !orderPlaced ? Clock3 : CircleCheckBig;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell checkout-confirmation-page">
      <section className={`card checkout-confirmation-card ${hasResult ? "has-result" : ""}`}>
        <div className={`checkout-confirmation-icon ${success ? "success" : "pending"}`}>
          <ResultIcon size={28} strokeWidth={2} aria-hidden="true"/>
        </div>

        <div className="checkout-confirmation-copy">
          <p className="eyebrow">{hasResult ? "Checkout complete" : "Checkout"}</p>
          <h1>{heading}</h1>
          <p>{explanation}</p>
        </div>

        {hasResult ? <dl className="checkout-confirmation-details">
          {isCredit && result.credit ? <div><dt>Approval reference</dt><dd>{result.credit}</dd></div> : null}
          {result.order ? <div><dt>Order reference</dt><dd>{result.order}</dd></div> : null}
          {isCredit && result.status ? <div><dt>Current status</dt><dd>{result.status}</dd></div> : null}
          {isCredit ? <div><dt>Company approval</dt><dd>{approvalRequired ? "Required" : "Not required"}</dd></div> : null}
        </dl> : null}

        <div className="checkout-confirmation-actions">
          {isCredit && result.credit ? <Link className="button" href={`/account/credit-orders/${encodeURIComponent(result.credit)}`}>
            <span>View order status</span>
            <ArrowRight size={17} aria-hidden="true"/>
          </Link> : null}
          {result.order ? <Link className="button" href="/account/orders">
            <span>View order history</span>
            <ArrowRight size={17} aria-hidden="true"/>
          </Link> : null}
          <Link className="button secondary" href="/catalogue">Continue shopping</Link>
          <Link className="button secondary" href="/account">Account</Link>
        </div>
      </section>
    </main>
  </>;
}
