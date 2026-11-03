# Open Employee Purchasing: Store integration

When Staff enables the company setting in Magento, buyers already authorised
for checkout can choose any active Employee in their selected company. The
new `css_company_buyable_employees` Magento operation is purchase-only and
does not expose Employee edit/finance APIs; no new Store role checks or
customer-supplied manager IDs are introduced.

Existing basket, kit, delivery, purchase eligibility, credit approval,
PO, and native order placement contracts remain unchanged. The Employee
list now paginates through the Magento 200-item limit, with an explicit
50-page safety ceiling rather than returning an incomplete list.

The canonical backend must deploy first. Magento then enforces scope on
cart assignment and credit/native submission. Admin is the only writer
of the setting. It defaults OFF everywhere.

**Controlled Employee delivery** is mutually incompatible with this
initial delegated-purchasing mode, because the mapping is owned by the
Employee's original manager's Magento customer account. Store fails
closed if both are enabled; Admin prevents that conflicting setting.
No manager address is copied, exposed or reused by a different buyer.

Focused smoke: (1) OFF manager-only, (2) ON existing buyer can select and
submit for another manager's active Employee using their own permitted
delivery address, (3) denied buyer/foreign company/inactive Employee,
(4) toggle OFF before submit rejects the delegated quote. Keep real
orders unsent until explicitly authorised.
