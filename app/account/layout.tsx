import type { ReactNode } from "react";
import { AccountSidebar } from "@/components/account-sidebar";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { getCreditOrderScopeCount } from "@/lib/magento/credit-orders";
import { getLatestCompanyOrderDate, hasCompanyOrderPlacedToday } from "@/lib/magento/orders";
import { requireCustomerToken } from "@/lib/session";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const token = await requireCustomerToken();
  const [ctx, approvalCount, poCount, latestSalesOrderDate] = await Promise.all([
    getCustomerContext(token),
    getCreditOrderScopeCount(token, "APPROVAL"),
    getCreditOrderScopeCount(token, "PO"),
    getLatestCompanyOrderDate(token),
  ]);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell account-workspace">
      <AccountSidebar
        name={name}
        email={ctx.customer.email}
        companies={ctx.css_company_context.companies}
        showApprovals={approvalCount !== null}
        showPoNumbers={poCount !== null}
        approvalCount={approvalCount ?? 0}
        poCount={poCount ?? 0}
        recentSalesOrder={hasCompanyOrderPlacedToday(latestSalesOrderDate)}
      />
      {children}
    </main>
  </>;
}
