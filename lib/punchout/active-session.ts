import { getPunchOutBrowserToken } from "@/lib/punchout/browser-session";
import { getPunchOutConfig } from "@/lib/punchout/config";
import { PunchOutSessionStore } from "@/lib/punchout/session";

export async function getActivePunchOutSession() {
  const browserToken = await getPunchOutBrowserToken();
  if (!browserToken) return null;
  const config = getPunchOutConfig();
  if (!config.enabled) return null;
  const store = new PunchOutSessionStore(config.sessionDbPath);
  try {
    const session = store.getActiveByBrowserToken(browserToken);
    const profile = config.profiles.find((p) => p.id === session?.profileId);
    if (!session || !profile || profile.companyId !== session.companyId ||
        profile.storeCode !== session.storeCode ||
        !profile.customerIds.includes(session.customerId)) return null;
    return { session, profile, config, browserToken };
  } finally { store.close(); }
}
