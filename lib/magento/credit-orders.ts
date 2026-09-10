import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";

export type CreditOrderScope = "MY" | "COMPANY" | "APPROVAL";

export type CreditOrderActions = {
  can_view: boolean;
  can_approve: boolean;
  can_reject: boolean;
  can_cancel: boolean;
  can_place_order: boolean;
  can_add_comment: boolean;
  requires_payment_details: boolean;
};

export type CreditOrderComment = {
  comment_id: number;
  creator_company_user_id: number;
  comment: string;
  created_at: string | null;
};

export type CreditOrderLog = {
  log_id: number;
  actor_company_user_id: number | null;
  activity_type: string | null;
  message: string | null;
  created_at: string | null;
};

export type CreditOrder = {
  credit_order_id: number;
  number: string;
  status: string;
  company_id: number;
  creator_company_user_id: number;
  grand_total: number;
  shipping_method: string | null;
  payment_method: string | null;
  auto_approved: boolean;
  approved_by: number[];
  order_id: number | null;
  order_number: string | null;
  created_at: string | null;
  updated_at: string | null;
  actions: CreditOrderActions;
  comments?: CreditOrderComment[];
  logs?: CreditOrderLog[];
};

export type CreditOrderPage = {
  total_count: number;
  items: CreditOrder[];
  page_info: {
    page_size: number;
    current_page: number;
    total_pages: number;
  };
};

export type CreditOrderListContext = {
  customer: { firstname: string; lastname: string };
  css_company_context: {
    selected_company_id: number | null;
    selected_company_user_id: number | null;
    companies: Array<{
      company_id: number;
      name: string | null;
      reference: string | null;
      selected: boolean;
    }>;
  };
  css_credit_orders: CreditOrderPage;
};

export type CreditOrderDetailContext = {
  customer: { firstname: string; lastname: string };
  css_company_context: {
    selected_company_id: number | null;
    selected_company_user_id: number | null;
    companies: Array<{
      company_id: number;
      name: string | null;
      reference: string | null;
      selected: boolean;
    }>;
  };
  css_credit_order: CreditOrder & {
    comments: CreditOrderComment[];
    logs: CreditOrderLog[];
  };
};

const CREDIT_ORDER_FIELDS = /* GraphQL */ `
  credit_order_id
  number
  status
  company_id
  creator_company_user_id
  grand_total
  shipping_method
  payment_method
  auto_approved
  approved_by
  order_id
  order_number
  created_at
  updated_at
  actions {
    can_view
    can_approve
    can_reject
    can_cancel
    can_place_order
    can_add_comment
    requires_payment_details
  }
`;

const CREDIT_ORDER_LIST = /* GraphQL */ `
  query StoreCreditOrders($scope: CssCreditOrderScope!, $currentPage: Int!, $pageSize: Int!) {
    customer { firstname lastname }
    css_company_context {
      selected_company_id
      selected_company_user_id
      companies { company_id name reference selected }
    }
    css_credit_orders(scope: $scope, currentPage: $currentPage, pageSize: $pageSize) {
      total_count
      page_info { page_size current_page total_pages }
      items { ${CREDIT_ORDER_FIELDS} }
    }
  }
`;

const CREDIT_ORDER_SCOPE_PROBE = /* GraphQL */ `
  query StoreCreditOrderScopeProbe($scope: CssCreditOrderScope!) {
    css_credit_orders(scope: $scope, currentPage: 1, pageSize: 1) {
      total_count
    }
  }
`;

const CREDIT_ORDER_DETAIL = /* GraphQL */ `
  query StoreCreditOrderDetail($number: String!) {
    customer { firstname lastname }
    css_company_context {
      selected_company_id
      selected_company_user_id
      companies { company_id name reference selected }
    }
    css_credit_order(number: $number) {
      ${CREDIT_ORDER_FIELDS}
      comments {
        comment_id
        creator_company_user_id
        comment
        created_at
      }
      logs {
        log_id
        actor_company_user_id
        activity_type
        message
        created_at
      }
    }
  }
`;

const ACTION_MUTATIONS: Record<"approve" | "reject" | "cancel" | "place", string> = {
  approve: /* GraphQL */ `
    mutation StoreApproveCreditOrder($input: CssCreditOrderActionInput!) {
      cssApproveCreditOrder(input: $input) { ${CREDIT_ORDER_FIELDS} }
    }
  `,
  reject: /* GraphQL */ `
    mutation StoreRejectCreditOrder($input: CssCreditOrderActionInput!) {
      cssRejectCreditOrder(input: $input) { ${CREDIT_ORDER_FIELDS} }
    }
  `,
  cancel: /* GraphQL */ `
    mutation StoreCancelCreditOrder($input: CssCreditOrderActionInput!) {
      cssCancelCreditOrder(input: $input) { ${CREDIT_ORDER_FIELDS} }
    }
  `,
  place: /* GraphQL */ `
    mutation StorePlaceCreditOrder($input: CssCreditOrderActionInput!) {
      cssPlaceCreditOrder(input: $input) { ${CREDIT_ORDER_FIELDS} }
    }
  `,
};

const ADD_COMMENT = /* GraphQL */ `
  mutation StoreAddCreditOrderComment($input: CssCreditOrderCommentInput!) {
    cssAddCreditOrderComment(input: $input) { ${CREDIT_ORDER_FIELDS} }
  }
`;

const SET_PURCHASE_ORDER_NUMBER = /* GraphQL */ `
  mutation StoreSetCreditOrderPurchaseOrderNumber($input: CssSetCreditOrderPurchaseOrderNumberInput!) {
    cssSetCreditOrderPurchaseOrderNumber(input: $input) { ${CREDIT_ORDER_FIELDS} }
  }
`;

export function getCreditOrders(token: string, scope: CreditOrderScope, currentPage: number, pageSize = 10) {
  return magentoGraphQL<CreditOrderListContext>(
    CREDIT_ORDER_LIST,
    { scope, currentPage, pageSize },
    token,
  );
}

export function getCreditOrder(token: string, number: string) {
  return magentoGraphQL<CreditOrderDetailContext>(CREDIT_ORDER_DETAIL, { number }, token);
}

export async function canUseCreditOrderScope(token: string, scope: CreditOrderScope) {
  try {
    await magentoGraphQL<{ css_credit_orders: { total_count: number } }>(
      CREDIT_ORDER_SCOPE_PROBE,
      { scope },
      token,
    );
    return true;
  } catch (error) {
    if (error instanceof MagentoGraphQLError && error.category === "graphql-authorization") return false;
    throw error;
  }
}

export async function performCreditOrderAction(
  token: string,
  action: "approve" | "reject" | "cancel" | "place",
  number: string,
  comment?: string,
) {
  const field = action === "approve"
    ? "cssApproveCreditOrder"
    : action === "reject"
      ? "cssRejectCreditOrder"
      : action === "cancel"
        ? "cssCancelCreditOrder"
        : "cssPlaceCreditOrder";

  const data = await magentoGraphQL<Record<string, CreditOrder>>(
    ACTION_MUTATIONS[action],
    {
      input: {
        number,
        ...(comment?.trim() ? { comment: comment.trim() } : {}),
      },
    },
    token,
  );
  return data[field];
}

export async function addCreditOrderComment(token: string, number: string, comment: string) {
  const data = await magentoGraphQL<{ cssAddCreditOrderComment: CreditOrder }>(
    ADD_COMMENT,
    { input: { number, comment } },
    token,
  );
  return data.cssAddCreditOrderComment;
}

export async function setCreditOrderPurchaseOrderNumber(
  token: string,
  number: string,
  purchaseOrderNumber: string,
) {
  const data = await magentoGraphQL<{ cssSetCreditOrderPurchaseOrderNumber: CreditOrder }>(
    SET_PURCHASE_ORDER_NUMBER,
    { input: { number, purchase_order_number: purchaseOrderNumber } },
    token,
  );
  return data.cssSetCreditOrderPurchaseOrderNumber;
}
