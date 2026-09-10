import { magentoGraphQL } from "@/lib/magento/client";

export type RepeatOrderListItem = {
  item_id: number;
  sku: string;
  quantity: number;
  store_id: number | null;
  compatible: boolean;
  reason: string | null;
  parent_sku: string | null;
  configurable_sku: string | null;
  variant_sku: string | null;
  employee_name: string | null;
};

export type RepeatOrderList = {
  list_id: number;
  name: string;
  description: string | null;
  updated_at: string | null;
  items: RepeatOrderListItem[];
};

export type RepeatPurchaseDecision = {
  parent_sku: string;
  decision: {
    status: string;
    reason: string | null;
  };
};

export type RepeatedGroupedOrderItem = {
  parent_sku: string;
  configurable_sku: string;
  variant_sku: string;
  quantity: number;
  employee_id: number | null;
  employee_name: string | null;
  employee_code: string | null;
};

export type SkippedRepeatOrderItem = {
  order_item_id: number;
  sku: string;
  reason: string;
};

export type RepeatGroupedOrderResult = {
  cart: { id: string };
  source_order_number: string;
  repeated_items: RepeatedGroupedOrderItem[];
  skipped_items: SkippedRepeatOrderItem[];
  purchase_decisions: RepeatPurchaseDecision[];
};

export type AddRepeatListToCartResult = {
  cart: { id: string };
  list: RepeatOrderList;
  added_items: RepeatOrderListItem[];
  skipped_items: RepeatOrderListItem[];
  purchase_decisions: RepeatPurchaseDecision[];
};

const REPEAT_ITEM_FIELDS = /* GraphQL */ `
  item_id
  sku
  quantity
  store_id
  compatible
  reason
  parent_sku
  configurable_sku
  variant_sku
  employee_name
`;

const REPEAT_LIST_FIELDS = /* GraphQL */ `
  list_id
  name
  description
  updated_at
  items { ${REPEAT_ITEM_FIELDS} }
`;

const REPEAT_LISTS = /* GraphQL */ `
  query StoreRepeatOrderLists {
    css_repeat_order_lists { ${REPEAT_LIST_FIELDS} }
  }
`;

const CREATE_REPEAT_LIST = /* GraphQL */ `
  mutation StoreCreateRepeatOrderList($input: CssCreateRepeatOrderListInput!) {
    cssCreateRepeatOrderList(input: $input) { ${REPEAT_LIST_FIELDS} }
  }
`;

const UPDATE_REPEAT_LIST = /* GraphQL */ `
  mutation StoreUpdateRepeatOrderList($input: CssUpdateRepeatOrderListInput!) {
    cssUpdateRepeatOrderList(input: $input) { ${REPEAT_LIST_FIELDS} }
  }
`;

const DELETE_REPEAT_LIST = /* GraphQL */ `
  mutation StoreDeleteRepeatOrderList($listId: Int!) {
    cssDeleteRepeatOrderList(list_id: $listId)
  }
`;

const SAVE_GROUPED_REPEAT_ITEM = /* GraphQL */ `
  mutation StoreSaveGroupedRepeatOrderListItem($input: CssSaveGroupedRepeatOrderListItemInput!) {
    cssSaveGroupedRepeatOrderListItem(input: $input) { ${REPEAT_LIST_FIELDS} }
  }
`;

const DELETE_REPEAT_ITEM = /* GraphQL */ `
  mutation StoreDeleteRepeatOrderListItem($input: CssDeleteRepeatOrderListItemInput!) {
    cssDeleteRepeatOrderListItem(input: $input) { ${REPEAT_LIST_FIELDS} }
  }
`;

const ADD_REPEAT_LIST_TO_CART = /* GraphQL */ `
  mutation StoreAddRepeatOrderListToCart($input: CssAddRepeatOrderListToCartInput!) {
    cssAddRepeatOrderListToCart(input: $input) {
      cart { id }
      list { ${REPEAT_LIST_FIELDS} }
      added_items { ${REPEAT_ITEM_FIELDS} }
      skipped_items { ${REPEAT_ITEM_FIELDS} }
      purchase_decisions { parent_sku decision { status reason } }
    }
  }
`;

const REPEAT_GROUPED_ORDER = /* GraphQL */ `
  mutation StoreRepeatGroupedConfigurableOrder($input: CssRepeatGroupedConfigurableOrderInput!) {
    cssRepeatGroupedConfigurableOrder(input: $input) {
      cart { id }
      source_order_number
      repeated_items {
        parent_sku
        configurable_sku
        variant_sku
        quantity
        employee_id
        employee_name
        employee_code
      }
      skipped_items { order_item_id sku reason }
      purchase_decisions { parent_sku decision { status reason } }
    }
  }
`;

export async function getRepeatOrderLists(token: string) {
  return magentoGraphQL<{ css_repeat_order_lists: RepeatOrderList[] }>(REPEAT_LISTS, {}, token);
}

export async function createRepeatOrderList(token: string, input: { name: string; description?: string }) {
  const data = await magentoGraphQL<{ cssCreateRepeatOrderList: RepeatOrderList }>(
    CREATE_REPEAT_LIST,
    { input },
    token,
  );
  return data.cssCreateRepeatOrderList;
}

export async function updateRepeatOrderList(
  token: string,
  input: { list_id: number; name?: string; description?: string },
) {
  const data = await magentoGraphQL<{ cssUpdateRepeatOrderList: RepeatOrderList }>(
    UPDATE_REPEAT_LIST,
    { input },
    token,
  );
  return data.cssUpdateRepeatOrderList;
}

export async function deleteRepeatOrderList(token: string, listId: number) {
  const data = await magentoGraphQL<{ cssDeleteRepeatOrderList: boolean }>(
    DELETE_REPEAT_LIST,
    { listId },
    token,
  );
  return data.cssDeleteRepeatOrderList;
}

export async function saveGroupedRepeatOrderListItem(
  token: string,
  input: {
    list_id: number;
    item_id?: number;
    parent_sku: string;
    configurable_sku: string;
    variant_sku: string;
    quantity: number;
    employee_name?: string;
  },
) {
  const data = await magentoGraphQL<{ cssSaveGroupedRepeatOrderListItem: RepeatOrderList }>(
    SAVE_GROUPED_REPEAT_ITEM,
    { input },
    token,
  );
  return data.cssSaveGroupedRepeatOrderListItem;
}

export async function deleteRepeatOrderListItem(token: string, listId: number, itemId: number) {
  const data = await magentoGraphQL<{ cssDeleteRepeatOrderListItem: RepeatOrderList }>(
    DELETE_REPEAT_ITEM,
    { input: { list_id: listId, item_id: itemId } },
    token,
  );
  return data.cssDeleteRepeatOrderListItem;
}

export async function addRepeatOrderListToCart(
  token: string,
  input: { cartId: string; listId: number; itemIds?: number[] },
) {
  const data = await magentoGraphQL<{ cssAddRepeatOrderListToCart: AddRepeatListToCartResult }>(
    ADD_REPEAT_LIST_TO_CART,
    {
      input: {
        cart_id: input.cartId,
        list_id: input.listId,
        ...(input.itemIds ? { item_ids: input.itemIds } : {}),
        replace_cart: false,
      },
    },
    token,
  );
  return data.cssAddRepeatOrderListToCart;
}

export async function repeatGroupedConfigurableOrder(token: string, cartId: string, orderNumber: string) {
  const data = await magentoGraphQL<{ cssRepeatGroupedConfigurableOrder: RepeatGroupedOrderResult }>(
    REPEAT_GROUPED_ORDER,
    { input: { cart_id: cartId, order_number: orderNumber } },
    token,
  );
  return data.cssRepeatGroupedConfigurableOrder;
}
