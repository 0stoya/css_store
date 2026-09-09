import { magentoGraphQL } from "@/lib/magento/client";

export type StoreProduct = {
  uid: string;
  sku: string;
  name: string;
  url_key: string | null;
  stock_status: string | null;
  small_image: { url: string; label: string | null } | null;
  price_range: {
    minimum_price: {
      regular_price: { value: number; currency: string };
      final_price: { value: number; currency: string };
    };
  } | null;
};

const PRODUCTS = /* GraphQL */ `
  query StoreProducts($search: String, $page: Int!, $pageSize: Int!) {
    products(search: $search, currentPage: $page, pageSize: $pageSize, sort: { name: ASC }) {
      total_count
      page_info { current_page total_pages }
      items {
        uid sku name url_key stock_status
        small_image { url label }
        price_range { minimum_price { regular_price { value currency } final_price { value currency } } }
      }
    }
  }
`;

export async function getProducts(token: string, search = "", page = 1, pageSize = 24) {
  const data = await magentoGraphQL<{ products: { total_count: number; page_info: { current_page: number; total_pages: number }; items: StoreProduct[] } }>(
    PRODUCTS,
    { search: search || null, page, pageSize },
    token,
  );
  return data.products;
}
