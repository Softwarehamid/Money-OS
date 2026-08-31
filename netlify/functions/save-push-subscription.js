const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function getUserFromToken(token) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function getMoneyOsState(userId) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/moneyos_state?id=eq.${encodeURIComponent(userId)}&select=state`,
    {
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );
  if (!response.ok) throw new Error("Could not load MoneyOS state.");
  const rows = await response.json();
  return rows[0]?.state || {};
}

async function saveMoneyOsState(userId, state) {
  const response = await fetch(`${supabaseUrl}/rest/v1/moneyos_state`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: userId,
      state,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error("Could not save notification device.");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json(500, { error: "Missing Supabase environment variables." });
  }

  const token = event.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Missing session token." });

  try {
    const user = await getUserFromToken(token);
    if (!user?.id) return json(401, { error: "Invalid session token." });

    const body = JSON.parse(event.body || "{}");
    const subscription = body.subscription;
    if (!subscription?.endpoint) return json(400, { error: "Missing push subscription." });

    const state = await getMoneyOsState(user.id);
    const currentSettings = state.notificationSettings || {};
    const subscriptions = Array.isArray(currentSettings.pushSubscriptions)
      ? currentSettings.pushSubscriptions
      : [];
    const nextSubscriptions = [
      subscription,
      ...subscriptions.filter((item) => item.endpoint !== subscription.endpoint),
    ].slice(0, 5);

    state.notificationSettings = {
      enabled: true,
      billReminders: true,
      savingsReminders: true,
      reminderWindowDays: 1,
      ...currentSettings,
      ...(body.settings || {}),
      pushSubscriptions: nextSubscriptions,
    };

    await saveMoneyOsState(user.id, state);
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || "Notification setup failed." });
  }
};
