"use server";

import { resetCustomerPassword } from "@/lib/magento/auth";

export type PasswordSetupResult = { success: boolean; error: string | null };

export const INITIAL_PASSWORD_SETUP_RESULT: PasswordSetupResult = {
  success: false,
  error: null,
};

export async function setPasswordAction(
  _previous: PasswordSetupResult,
  formData: FormData,
): Promise<PasswordSetupResult> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const token = String(formData.get("resetPasswordToken") || "").trim();
  const password = String(formData.get("newPassword") || "");
  const confirmation = String(formData.get("confirmPassword") || "");

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Enter the email address associated with this account." };
  }
  if (!token || token.length > 255) {
    return { success: false, error: "Your password setup link is incomplete. Request a fresh invitation." };
  }
  if (password.length < 8 || password.length > 256) {
    return { success: false, error: "Enter a password of at least 8 characters." };
  }
  if (password !== confirmation) {
    return { success: false, error: "The passwords do not match." };
  }

  try {
    const success = await resetCustomerPassword(email, token, password);
    return success
      ? { success: true, error: null }
      : { success: false, error: "Your password could not be set. Request a new invitation if the link has expired." };
  } catch {
    // Do not echo Magento errors or any reset token/password back to the client.
    return { success: false, error: "Your password could not be set. The link may have expired, or the password may not meet the account policy." };
  }
}
