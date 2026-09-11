import type { ReactNode } from "react";
import { AccountSidebar } from "@/components/account-sidebar";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { canUseCreditOrderScope } from "@/lib/magento/credit-orders";
import { requireCustomerToken } from "@/lib/session";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const token = await requireCustomerToken();
  const [ctx, canApprove] = await Promise.all([
    getCustomerContext(token),
    canUseCreditOrderScope(token, "APPROVAL"),
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
        showApprovals={canApprove}
      />
      {children}
    </main>
  </>;
}
