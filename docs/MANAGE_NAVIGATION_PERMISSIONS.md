# Store header: permission-gated Manage link

**Problem:** The Store displayed Manage to every signed-in customer, including
users who cannot manage anything in the Company Portal.

**Rule:** Show Manage only for the genuine, saved Company Administrator or
a company user with native Magento Users Edit, Roles Edit, Catalogue Visibility
Manage, Purchase Controls Manage, or Employees Manage authority.
Read-only users, buyers, purchase approvers, PO-only clerks and role names
such as "Manager" do not grant the link on their own.

**Backend:** Customer-token, selected-company read-only GraphQL
the css_company_manage_navigation field in the companion Commerce PR.
It returns only company_id, company_user_id and can_manage. The Store
requires true and positive numeric company and user IDs. An unavailable
GraphQL operation (Commerce not deployed), Magento denial or network error
hides Manage without breaking shopping.

**No security change:** The Portal still authenticates its own app-switch
tickets, selected company and all mutations. This is only navbar visibility.

## Deploy and accept

1. Deploy companion Commerce GraphQL capability to Magento Demo first.
2. Deploy this Store change. Confirm real Company Administrator and each
   manage-only role show Manage, but viewer/buyer/approver/PO-only do not.
3. Check Home, catalogue and Account pages. Changing selected company or
   revoking a saved role must reflect on the next request.
4. Missing Magento operation must simply hide Manage; no blank page.
5. For Live, Fluidcommerce must deploy the pinned Commerce ZIP before
   rolling this Store UI to production, unless temporarily hiding Manage
   for all company users is explicitly accepted.

No roles, orders or companies are changed by this PR.
