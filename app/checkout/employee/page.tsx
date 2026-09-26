import { redirect } from "next/navigation";

export const metadata = { title: "Checkout details" };

export default function CheckoutEmployeePage() {
  redirect("/checkout/delivery");
}
