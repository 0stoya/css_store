"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { submitReturnRequest } from "@/lib/magento/returns";
import { requireCustomerToken } from "@/lib/session";

function errorMessage(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The return request could not be submitted.";
}

function redirectWith(kind: "error" | "notice", message: string): never {
  redirect(`/account/returns?${kind}=${encodeURIComponent(message)}`);
}

export async function submitReturnRequestAction(formData: FormData) {
  const token = await requireCustomerToken();
  const order = String(formData.get("order") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const telephone = String(formData.get("telephone") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!email) redirectWith("error", "Enter the email address for this return request.");
  if (!telephone) redirectWith("error", "Enter a telephone number.");
  if (!message) redirectWith("error", "Enter a message describing the return request.");

  try {
    const result = await submitReturnRequest(token, {
      ...(order ? { order } : {}),
      email,
      telephone,
      message,
    });

    if (!result.success) {
      redirectWith("error", result.message || "The return request was not accepted.");
    }

    redirectWith(
      "notice",
      `Return request #${result.request_id} submitted. ${result.message}`.trim(),
    );
  } catch (error) {
    redirectWith("error", errorMessage(error));
  }
}
