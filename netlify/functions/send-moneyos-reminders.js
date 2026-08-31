const webpush = require("web-push");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublicKey = process.env.MONEYOS_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.MONEYOS_VAPID_PRIVATE_KEY;
const vapidSubject = process.env.MONEYOS_VAPID_SUBJECT || "mailto:moneyos@example.com";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function money(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString()}`;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daysUntil(dateString, now = new Date()) {
  if (!dateString) return Infinity;
  const target = startOfDay(new Date(`${dateString}T12:00:00`));
  return Math.round((target - startOfDay(now)) / 86400000);
}

function remainingBill(bill) {
  return Math.max(0, Number(bill.amountDue) - Number(bill.paidAmount || 0));
}

function savingsSummary(state) {
  const goals = Array.isArray(state.savingsGoals) ? state.savingsGoals : [];
  const current = goals.reduce((total, goal) => total + Number(goal.current || 0), 0);
  const target = goals.reduce((total, goal) => total + Number(goal.target || 0), 0);
  return { current, target, remaining: Math.max(0, target - current) };
}

function remindersForState(state) {
  const settings = state.notificationSettings || {};
  const reminders = [];
  if (settings.billReminders !== false) {
    const bills = Array.isArray(state.bills) ? state.bills : [];
    bills
      .filter((bill) => remainingBill(bill) > 0)
      .filter((bill) => daysUntil(bill.dueDate) >= 0 && daysUntil(bill.dueDate) <= 1)
      .slice(0, 3)
      .forEach((bill) => {
        const dueText = daysUntil(bill.dueDate) === 0 ? "today" : "tomorrow";
        reminders.push({
          title: `${bill.name} due ${dueText}`,
          body: `${money(remainingBill(bill))} due ${bill.dueDate}`,
          tag: `bill-${bill.id}-${bill.dueDate}`,
        });
      });
  }

  const isMonday = new Date().getUTCDay() === 1;
  if (settings.savingsReminders !== false && isMonday) {
    const savings = savingsSummary(state);
    if (savings.target > 0) {
      reminders.push({
        title: "MoneyOS savings check",
        body: `${money(savings.current)} / ${money(savings.target)} saved. ${money(savings.remaining)} left.`,
        tag: `savings-${new Date().toISOString().slice(0, 10)}`,
      });
    }
  }

  return reminders;
}

async function getRows() {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/moneyos_state?select=id,state`,
    {
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );
  if (!response.ok) throw new Error("Could not load MoneyOS states.");
  return response.json();
}

exports.handler = async () => {
  if (!supabaseUrl || !supabaseServiceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return json(500, { error: "Missing reminder environment variables." });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const rows = await getRows();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const state = row.state || {};
    const settings = state.notificationSettings || {};
    if (!settings.enabled) continue;
    const subscriptions = Array.isArray(settings.pushSubscriptions)
      ? settings.pushSubscriptions
      : [];
    const reminders = remindersForState(state);

    for (const reminder of reminders) {
      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification(
            subscription,
            JSON.stringify({ ...reminder, url: "/index.html" }),
          );
          sent += 1;
        } catch (error) {
          failed += 1;
          console.warn("Push failed:", error.statusCode || error.message);
        }
      }
    }
  }

  return json(200, { ok: true, sent, failed });
};
