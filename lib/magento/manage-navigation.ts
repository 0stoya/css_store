import { cache } from "react";
import { magentoGraphQL, MagentoGraphQLError } from "@/lib/magento/client";

export type CompanyManageNavigation = {
  company_id: number;
  company_user_id: number;
  can_manage: boolean;
};

const MANAGE_NAVIGATION = /* GraphQL */ `
  query StoreCompanyManageNavigation {
    css_company_manage_navigation {
      company_id
      company_user_id
      can_manage
    }
  }
`;

/**
 * The Store navbar is a presentation choice, not a permission grant.
 * Portal operations continue to enforce Magento company-user ACL.
 * React cache is scoped to the current server render/request.
 */
export const canManageSelectedCompany = cache(async function canManageSelectedCompany(
  customerToken: string,
): Promise<boolean> {
  if (!customerToken) return false;

  try {
    const data = await magentoGraphQL<{
      css_company_manage_navigation: CompanyManageNavigation | null;
    }>(MANAGE_NAVIGATION, {}, customerToken);
    const access = data.css_company_manage_navigation;
    return Boolean(
      access?.can_manage === true
      && Number.isSafeInteger(access.company_id)
      && access.company_id > 0
      && Number.isSafeInteger(access.company_user_id)
      && access.company_user_id > 0,
    );
  } catch (error) {
    if (error instanceof MagentoGraphQLError) {
      // Missing Commerce GraphQL schema, permission denial, or network
      // failure: hide the link rather than guessing access.
      // Session-expiry redirects are not swallowed here.
      return false;
    }
    throw error;
  }
});
