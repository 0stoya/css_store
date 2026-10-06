import { getPunchOutBrowserToken } from "@/lib/punchout/browser-session";
import { getPunchOutConfig, type PunchOutConfig } from "@/lib/punchout/config";
import { PunchOutSessionStore } from "@/lib/punchout/session";

export async function getActivePunchOutSession() {
  let config: PunchOutConfig;
  try {
    config = getPunchOutConfig();
  } catch {
    return null;
  }
  if (!config.enabled) return null;

  const browserToken = await getPunchOutBrowserToken();
  if (!browserToken) return null;

  let store: PunchOutSessionStore;
  try {
    store = new PunchOutSessionStore(config.sessionDbPath);
  } catch {
    return null;
  }

  try {
    const session = store.getActiveByBrowserToken(browserToken);
    if (
      !session
      || session.customerId !== config.magentoCustomerId
      || session.companyId !== config.companyId
      || session.storeCode !== config.storeCode
    ) {
      return null;
    }
    return session;
  } finally {
    store.close();
  }
}
