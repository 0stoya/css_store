# Intelligent checkout (Job 01)

Store-only; no Magento schema changes, no Hyvä, no new DB and no order submission from automatic defaults.

- Ordinary/multi-Employee checkout: when the quote has no delivery address, use the current customer's one explicit Magento default shipping address, or their sole saved address. Multiple unmarked/default candidates require a customer choice. Keep an existing quote destination.
- Single-Employee checkout: existing Employee assignment/controlled recipient rules remain authoritative. Never substitute a personal default, clear pending review, or bypass required recipient confirmation.
- Select a sole available shipping rate (explicitly available, no error) after setting/reading the address. Read back Magento's saved rate; normal cart totals render after redirect.
- Automatic shipping writes occur only via an authenticated, same-cart/company/customer POST after checkout hydration, not a render, link prefetch, or GET. An error stops automatic retries and leaves manual checkout controls available. No order submission, payment write or PO retry in this POST.
- A sole payment method is displayed as fixed and submitted with the existing final form. Final server action still validates method and saves it to the quote, retaining Magento's role-based PO prompt.
- Keep multiple choices, current valid selections, existing checkout/credit/Employee guards and native Magento totals.

## Release gate

Run all existing tests and the new checkout-defaults tests, typecheck, lint and build on a disconnected PR checkout. Then use existing Demo companies: ordinary single choice, multiple addresses/methods, Employee mapped and pending-review/recipient, company credit order PO-required and ordinary approval. Verify Magento quote address, shipping and total readback and no automatic order. No Live deployment until accepted.

Company-level restrictions/approved-address ownership and content verification are Job 02, not part of this PR.
