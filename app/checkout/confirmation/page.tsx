import Link from "next/link";
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
    ? "Magento accepted the order submission."
    : "This page does not contain a completed checkout result. Return to your basket or catalogue to continue.";

  if (isCredit && approvalRequired) {
    heading = "Order submitted for approval";
    explanation = "Fluid created a company credit order and placed it into the approval workflow. No Magento sales order has been faked or created ahead of approval.";
  } else if (isCredit && orderPlaced) {
    heading = "Order placed";
    explanation = "Fluid accepted the company credit order and completed Magento sales-order creation.";
  } else if (isCredit) {
    heading = "Credit order submitted";
    explanation = "Fluid accepted the credit order. Its current backend status is shown below; sales-order creation has not been assumed by the storefront.";
  }

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell">
      <section className="card delivery-card stack" style={{maxWidth:760,margin:"36px auto"}}>
        <div>
          <p className="eyebrow">{hasResult ? "Checkout complete" : "Checkout"}</p>
          <h1>{heading}</h1>
          <p className="muted">{explanation}</p>
        </div>

        {hasResult ? <dl className="basket-totals">
          {isCredit && result.credit ? <div><dt>Credit order</dt><dd>{result.credit}</dd></div> : null}
          {result.order ? <div><dt>Magento order</dt><dd>{result.order}</dd></div> : null}
          {isCredit && result.status ? <div><dt>Fluid status</dt><dd>{result.status}</dd></div> : null}
          {isCredit ? <div><dt>Approval required</dt><dd>{approvalRequired ? "Yes" : "No"}</dd></div> : null}
          {isCredit && result.auto === "1" ? <div><dt>Auto approved</dt><dd>Yes</dd></div> : null}
        </dl> : null}

        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Link className="button" href="/catalogue">Continue shopping</Link>
          <Link className="button secondary" href="/basket">Basket</Link>
          <Link className="button secondary" href="/account">Account</Link>
        </div>
      </section>
    </main>
  </>;
}
