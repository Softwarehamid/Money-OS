const storageKey = "moneyos-state-v2";

const tabs = [
  { id: "Dashboard", short: "Home" },
  { id: "Paychecks", short: "Pay" },
  { id: "Bills", short: "Bills" },
  { id: "Debts", short: "Debt" },
  { id: "Budget", short: "Spend" },
  { id: "Savings", short: "Save" },
  { id: "Calendar", short: "Cal" },
  { id: "Reports", short: "Stats" },
  { id: "Settings", short: "Set" },
];

const today = startOfDay(new Date());

const seedState = {
  currentCash: 0,
  emergencyBuffer: 0,
  plannedDebtPayments: 0,
  plannedSavings: 0,
  monthlyDebtTarget: 0,
  monthlySavingsPace: 0,
  paychecks: [],
  bills: [],
  debts: [],
  budgetCategories: [],
  savingsGoals: [],
  expenses: [],
  payments: [],
};

let state = loadState();
let activeTab = "Dashboard";

const navTabs = document.querySelector("#navTabs");
const content = document.querySelector("#content");
const pageTitle = document.querySelector("#pageTitle");
const quickAddBtn = document.querySelector("#quickAddBtn");
const entryDialog = document.querySelector("#entryDialog");
const entryForm = document.querySelector("#entryForm");
const entryType = document.querySelector("#entryType");
const formFields = document.querySelector("#formFields");
const todayLabel = document.querySelector("#todayLabel");
const dialogTitle = document.querySelector("#dialogTitle");
const saveEntryBtn = document.querySelector("#saveEntryBtn");
const deleteEntryBtn = document.querySelector("#deleteEntryBtn");
const menuToggleBtn = document.querySelector("#menuToggleBtn");
const sidebar = document.querySelector("#sidebar");

let editingEntryId = null;

todayLabel.textContent = formatDate(today, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

function loadState() {
  const stored = localStorage.getItem(storageKey);
  const parsed = stored ? JSON.parse(stored) : structuredClone(seedState);
  return normalizeState(parsed);
}

function normalizeState(input) {
  const next = { ...structuredClone(seedState), ...(input || {}) };
  next.currentCash = Number(next.currentCash) || 0;
  next.emergencyBuffer = Number(next.emergencyBuffer) || 0;
  next.plannedDebtPayments = Number(next.plannedDebtPayments) || 0;
  next.plannedSavings = Number(next.plannedSavings) || 0;
  next.monthlyDebtTarget = Number(next.monthlyDebtTarget) || 0;
  next.monthlySavingsPace = Number(next.monthlySavingsPace) || 0;
  next.paychecks = Array.isArray(next.paychecks) ? next.paychecks : [];
  next.bills = Array.isArray(next.bills) ? next.bills : [];
  next.debts = Array.isArray(next.debts) ? next.debts : [];
  next.budgetCategories = Array.isArray(next.budgetCategories)
    ? next.budgetCategories
    : [];
  next.savingsGoals = Array.isArray(next.savingsGoals) ? next.savingsGoals : [];
  next.expenses = Array.isArray(next.expenses) ? next.expenses : [];
  next.payments = Array.isArray(next.payments) ? next.payments : [];
  return next;
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", options).format(
    new Date(`${toDateString(value)}T12:00:00`),
  );
}

function toDateString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function daysUntil(date) {
  return Math.round(
    (startOfDay(new Date(`${date}T12:00:00`)) - today) / 86400000,
  );
}

function getNextPaycheck() {
  return [...state.paychecks]
    .filter((paycheck) => daysUntil(paycheck.payDate) >= 0)
    .sort((a, b) => a.payDate.localeCompare(b.payDate))[0];
}

function billsBeforeNextPaycheck() {
  const next = getNextPaycheck();
  if (!next) return [];
  return state.bills
    .filter((bill) => bill.dueDate < next.payDate && remainingBill(bill) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function remainingBill(bill) {
  return Math.max(0, Number(bill.amountDue) - Number(bill.paidAmount || 0));
}

function sum(items, key) {
  return items.reduce(
    (total, item) =>
      total + Number(typeof key === "function" ? key(item) : item[key] || 0),
    0,
  );
}

function metrics() {
  const next = getNextPaycheck();
  const beforeNext = billsBeforeNextPaycheck();
  const billsDue = sum(beforeNext, remainingBill);
  const safeToSpend =
    state.currentCash -
    billsDue -
    state.plannedDebtPayments -
    state.plannedSavings -
    state.emergencyBuffer;
  const daysLeft = next ? Math.max(1, daysUntil(next.payDate)) : 1;
  const totalDebt = sum(state.debts, "balance");
  const currentMonth = toDateString(today).slice(0, 7);
  const paidThisMonth = sum(
    state.payments.filter(
      (payment) =>
        payment.type === "debt" && payment.date.slice(0, 7) === currentMonth,
    ),
    "amount",
  );
  return {
    next,
    beforeNext,
    billsDue,
    safeToSpend,
    daysLeft,
    dailyLimit: safeToSpend / daysLeft,
    totalDebt,
    paidThisMonth,
    debtFreeMonths:
      state.monthlyDebtTarget > 0
        ? Math.ceil(totalDebt / state.monthlyDebtTarget)
        : null,
  };
}

function urgency(bill) {
  if (remainingBill(bill) === 0) return { label: "Paid", tone: "green" };
  const days = daysUntil(bill.dueDate);
  if (days < 0) return { label: "Overdue", tone: "red" };
  if (days === 0) return { label: "Due Today", tone: "red" };
  if (days <= 3) return { label: `Due in ${days} days`, tone: "yellow" };
  return { label: `Due ${formatDate(bill.dueDate)}`, tone: "blue" };
}

function utilization(debt) {
  return debt.limit ? (debt.balance / debt.limit) * 100 : 0;
}

function utilizationTone(rate) {
  if (rate >= 90) return "red";
  if (rate >= 50) return "yellow";
  return "green";
}

function recommendation() {
  const m = metrics();
  if (
    state.paychecks.length === 0 &&
    state.bills.length === 0 &&
    state.debts.length === 0
  ) {
    return {
      tone: "good",
      title: "Start here",
      text: "Add your next paycheck, then your bills, then your debt accounts to generate a full plan.",
    };
  }

  const highestUtilization = [...state.debts].sort(
    (a, b) => utilization(b) - utilization(a),
  )[0];
  const smallestDebt = [...state.debts].sort(
    (a, b) => a.balance - b.balance,
  )[0];
  const dueSoon = state.bills.find(
    (bill) => remainingBill(bill) > 0 && daysUntil(bill.dueDate) <= 3,
  );

  if (m.safeToSpend < 0) {
    return {
      tone: "danger",
      title: "Warning",
      text: `You are short by ${money(Math.abs(m.safeToSpend))} before your next paycheck. Pause extra debt payments and protect required bills first.`,
    };
  }

  if (dueSoon) {
    return {
      tone: "warning",
      title: "Due date move",
      text: `${dueSoon.name} is ${urgency(dueSoon).label.toLowerCase()} with ${money(remainingBill(dueSoon))} remaining. Pay that before making extra moves.`,
    };
  }

  if (smallestDebt && m.safeToSpend > smallestDebt.balance) {
    return {
      tone: "good",
      title: "Recommended move",
      text: `You can wipe out ${smallestDebt.name} with ${money(smallestDebt.balance)} and still have about ${money(m.safeToSpend - smallestDebt.balance)} safe to spend.`,
    };
  }

  if (highestUtilization && utilization(highestUtilization) > 70) {
    return {
      tone: "warning",
      title: "Debt focus",
      text: `${highestUtilization.name} utilization is ${utilization(highestUtilization).toFixed(0)}%. Prioritize bringing it below 50% when bills are covered.`,
    };
  }

  return {
    tone: "good",
    title: "Good move",
    text: `You have ${money(m.safeToSpend)} safe to spend, about ${money(m.dailyLimit)} per day until the next paycheck.`,
  };
}

function renderNav() {
  navTabs.innerHTML = tabs
    .map(
      (tab) => `
      <button class="nav-button ${tab.id === activeTab ? "active" : ""}" type="button" data-tab="${tab.id}" aria-label="${tab.id}">
        <span class="nav-label">${tab.id}</span>
        <span class="nav-short">${tab.short}</span>
      </button>
    `,
    )
    .join("");
}

function render() {
  pageTitle.textContent = activeTab;
  renderNav();
  const renderer = {
    Dashboard: renderDashboard,
    Paychecks: renderPaychecks,
    Bills: renderBills,
    Debts: renderDebts,
    Budget: renderBudget,
    Savings: renderSavings,
    Calendar: renderCalendar,
    Reports: renderReports,
    Settings: renderSettings,
  }[activeTab];
  content.innerHTML = renderer();
  bindContentActions();
}

function renderDashboard() {
  const m = metrics();
  const rec = recommendation();
  const nextText = m.next
    ? `${formatDate(m.next.payDate)} · ${money(m.next.netEstimate)} · ${m.daysLeft} days left`
    : "No paycheck planned";
  const moveOut = state.savingsGoals.find(
    (goal) => goal.name === "Move-out fund",
  );
  const moveOutCurrent = Number(moveOut?.current || 0);
  const moveOutTarget = Number(moveOut?.target || 0);
  const moveOutProgress = moveOutTarget
    ? Math.min(100, (moveOutCurrent / moveOutTarget) * 100)
    : 0;
  const safeTone =
    m.safeToSpend < 0 ? "danger" : m.safeToSpend < 150 ? "warn" : "good";

  return `
    <div class="dashboard-grid">
      ${metricCard("Current cash", money(state.currentCash), "Manual cash available", "hero-card")}
      ${metricCard("Safe to spend", money(m.safeToSpend), `${money(m.dailyLimit)} per day`, `hero-card ${safeTone}`)}
      ${metricCard("Next paycheck", m.next ? formatDate(m.next.payDate) : "None", nextText)}
      ${metricCard("Bills before next check", money(m.billsDue), `${m.beforeNext.length} items before payday`)}
      ${metricCard("Debt remaining", money(m.totalDebt), `${money(m.paidThisMonth)} paid this month`)}
      ${metricCard("Emergency buffer", money(state.emergencyBuffer), "Protected from safe spending")}
      <article class="card">
        <p class="metric-label">Move-out fund</p>
        <p class="metric-value">${money(moveOutCurrent)}</p>
        <p class="metric-sub">${moveOutProgress.toFixed(1)}% of ${money(moveOutTarget)}</p>
        <div class="progress" style="--progress:${moveOutProgress}%"><span></span></div>
      </article>
      ${metricCard("Debt-free estimate", estimateDate(m.debtFreeMonths), `${m.debtFreeMonths || 0} months at ${money(state.monthlyDebtTarget)}/mo`)}
    </div>

    <section class="recommendation ${rec.tone === "danger" ? "danger" : rec.tone === "warning" ? "warning" : ""}">
      <p class="eyebrow">${rec.title}</p>
      <p>${rec.text}</p>
    </section>

    <div class="split-grid">
      <section class="table-panel">
        <div class="panel-head">
          <h2>Before Next Paycheck</h2>
          <button class="tiny-button" data-open="bill" type="button">Add Bill</button>
        </div>
        <div class="item-list">${m.beforeNext.map(renderBillItem).join("") || emptyState("No bills before the next paycheck.")}</div>
      </section>
      <section class="paycheck-plan">
        <div class="panel-head"><h2>Paycheck Plan</h2></div>
        ${renderPaycheckPlan()}
      </section>
    </div>
  `;
}

function metricCard(label, value, sub, extraClass = "") {
  const tone = extraClass.includes("danger")
    ? "danger"
    : extraClass.includes("warn")
      ? "warn"
      : extraClass.includes("good")
        ? "good"
        : "";
  return `
    <article class="card ${extraClass}">
      <p class="metric-label">${label}</p>
      <p class="metric-value ${tone}">${value}</p>
      <p class="metric-sub">${sub}</p>
    </article>
  `;
}

function renderPaycheckPlan() {
  const m = metrics();
  const next = m.next;
  if (!next) return emptyState("Add a paycheck to generate a plan.");
  return `
    <div class="item-list">
      ${planLine("Expected paycheck", money(next.netEstimate), "green")}
      ${m.beforeNext.map((bill) => planLine(bill.name, money(remainingBill(bill)), urgency(bill).tone)).join("")}
      ${planLine("Debt attack", money(state.plannedDebtPayments), "blue")}
      ${planLine("Savings", money(state.plannedSavings), "green")}
      ${planLine("Keep buffer", money(state.emergencyBuffer), "yellow")}
      ${planLine("Safe spending left", money(m.safeToSpend), m.safeToSpend < 0 ? "red" : "green")}
    </div>
  `;
}

function planLine(name, amount, tone) {
  return `<div class="list-item"><span>${name}</span><span class="pill ${tone}">${amount}</span></div>`;
}

function renderPaychecks() {
  return panel(
    "Paychecks",
    "Add Paycheck",
    "paycheck",
    state.paychecks
      .sort((a, b) => a.payDate.localeCompare(b.payDate))
      .map(
        (paycheck) => `
      <div class="list-item">
        <div>
          <strong>${formatDate(paycheck.payDate)} · ${paycheck.employer}</strong>
          <div class="pill-row">
            <span class="pill green">${money(paycheck.actualNet || paycheck.netEstimate)}</span>
            <span class="pill blue">${paycheck.status}</span>
            <span class="pill">${paycheck.regularHours || 0} regular hrs</span>
            <span class="pill">${paycheck.overtimeHours || 0} OT hrs</span>
            <span class="pill">${paycheck.recurring ? "Biweekly" : "One-time"}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="tiny-button" data-edit-paycheck="${paycheck.id}" type="button">Edit</button>
          <button class="tiny-button" data-receive-paycheck="${paycheck.id}" type="button">Received</button>
        </div>
      </div>
    `,
      )
      .join(""),
  );
}

function renderBills() {
  const groups = [
    ["Due before next paycheck", billsBeforeNextPaycheck()],
    [
      "Upcoming this month",
      state.bills
        .filter(
          (bill) =>
            remainingBill(bill) > 0 &&
            bill.dueDate >= (getNextPaycheck()?.payDate || ""),
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    ],
    ["Paid", state.bills.filter((bill) => remainingBill(bill) === 0)],
  ];
  return groups
    .map(([title, bills]) =>
      panel(
        title,
        "Add Bill",
        "bill",
        bills.map(renderBillItem).join("") || emptyState("Nothing here yet."),
      ),
    )
    .join("");
}

function renderBillItem(bill) {
  const status = urgency(bill);
  return `
    <div class="list-item">
      <div>
        <strong>${bill.name}</strong>
        <div class="pill-row">
          <span class="pill ${status.tone}">${status.label}</span>
          <span class="pill">${money(remainingBill(bill))} left</span>
          <span class="pill">${bill.category}</span>
          <span class="pill">${bill.priority}</span>
        </div>
      </div>
      <button class="tiny-button" data-pay-bill="${bill.id}" type="button">Pay</button>
    </div>
  `;
}

function renderDebts() {
  const m = metrics();
  return `
    <div class="dashboard-grid">
      ${metricCard("Total debt", money(m.totalDebt), `${state.debts.length} active accounts`, "hero-card")}
      ${metricCard("Paid this month", money(m.paidThisMonth), `Target ${money(state.monthlyDebtTarget)}`)}
      ${metricCard("Minimums", money(sum(state.debts, "minimumPayment")), "Monthly required payments")}
      ${metricCard("Best payoff", state.debts.sort((a, b) => a.balance - b.balance)[0]?.name || "None", "Hybrid: small payoff first")}
    </div>
    ${panel(
      "Debt Accounts",
      "Add Debt",
      "debt",
      state.debts
        .map((debt) => {
          const rate = utilization(debt);
          return `
        <div class="list-item">
          <div>
            <strong>${debt.name}</strong>
            <div class="pill-row">
              <span class="pill">${money(debt.balance)} balance</span>
              <span class="pill ${utilizationTone(rate)}">${rate.toFixed(0)}% utilization</span>
              <span class="pill blue">${debt.apr}% APR</span>
              <span class="pill">${money(debt.minimumPayment)} min</span>
            </div>
            <div class="progress" style="--progress:${Math.min(100, rate)}%"><span></span></div>
          </div>
          <button class="tiny-button" data-pay-debt="${debt.id}" type="button">Pay</button>
        </div>
      `;
        })
        .join(""),
    )}
  `;
}

function renderBudget() {
  const rows = state.budgetCategories
    .map((category) => {
      const budgeted = Number(category.limit) || 0;
      const spent = sum(
        state.expenses.filter((expense) => expense.category === category.name),
        "amount",
      );
      const percent =
        budgeted > 0 ? Math.min(100, (spent / budgeted) * 100) : 0;
      return `
      <div class="list-item">
        <div>
          <strong>${category.name}</strong>
          <div class="pill-row"><span class="pill">${money(spent)} spent</span><span class="pill green">${money(Math.max(0, budgeted - spent))} left</span></div>
          <div class="progress" style="--progress:${percent}%"><span></span></div>
        </div>
        <span class="pill">${money(budgeted)}</span>
      </div>
    `;
    })
    .join("");
  return panel(
    "Budget Categories",
    "Add Category",
    "budget",
    rows ||
      emptyState("No budget categories yet. Add one to start tracking spend."),
  );
}

function renderSavings() {
  return panel(
    "Savings Goals",
    "Add Goal",
    "saving",
    state.savingsGoals
      .map((goal) => {
        const progress = Math.min(100, (goal.current / goal.target) * 100);
        const months = monthsUntil(goal.deadline);
        const needed = months > 0 ? (goal.target - goal.current) / months : 0;
        return `
      <div class="list-item">
        <div>
          <strong>${goal.name}</strong>
          <div class="pill-row">
            <span class="pill green">${money(goal.current)} saved</span>
            <span class="pill">${progress.toFixed(1)}%</span>
            <span class="pill blue">${money(needed)}/mo needed</span>
          </div>
          <div class="progress" style="--progress:${progress}%"><span></span></div>
        </div>
        <span class="pill">${money(goal.target)}</span>
      </div>
    `;
      })
      .join(""),
  );
}

function renderCalendar() {
  const items = [
    ...state.bills.map((bill) => ({
      date: bill.dueDate,
      title: bill.name,
      amount: remainingBill(bill),
      type: "Bill",
    })),
    ...state.paychecks.map((paycheck) => ({
      date: paycheck.payDate,
      title: paycheck.employer,
      amount: paycheck.actualNet || paycheck.netEstimate,
      type: "Paycheck",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return panel(
    "Money Calendar",
    "Add Item",
    "bill",
    items
      .map(
        (item) => `
    <div class="list-item">
      <div><strong>${formatDate(item.date)} · ${item.title}</strong><div class="pill-row"><span class="pill ${item.type === "Paycheck" ? "green" : "yellow"}">${item.type}</span></div></div>
      <span class="pill">${money(item.amount)}</span>
    </div>
  `,
      )
      .join(""),
  );
}

function renderReports() {
  const income = sum(
    state.paychecks.filter((p) => p.status === "received"),
    (p) => p.actualNet || p.netEstimate,
  );
  const billsPaid = sum(
    state.payments.filter((payment) => payment.type === "bill"),
    "amount",
  );
  const debtPaid = sum(
    state.payments.filter((payment) => payment.type === "debt"),
    "amount",
  );
  const saved = sum(
    state.payments.filter((payment) => payment.type === "savings"),
    "amount",
  );
  const spent = sum(state.expenses, "amount");
  const grade =
    debtPaid > 700 && saved > 250
      ? "A"
      : debtPaid > 400
        ? "B+"
        : spent > income
          ? "D"
          : "C";

  return `
    <div class="dashboard-grid">
      ${metricCard("Income", money(income), "Current period")}
      ${metricCard("Bills paid", money(billsPaid), "Required payments")}
      ${metricCard("Debt paid", money(debtPaid), "Balance attack")}
      ${metricCard("Saved", money(saved), "Goal progress")}
      ${metricCard("Spending", money(spent), "Food, gas, car, fun")}
      ${metricCard("Money grade", grade, "Strong debt progress")}
    </div>
    <section class="recommendation">
      <p class="eyebrow">Monthly readout</p>
      <p>You paid strong debt this month. Car repairs hit savings, but net progress is still solid if you protect the next paycheck plan.</p>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="table-panel">
      <div class="panel-head"><h2>Settings</h2></div>
      <div class="form-grid">
        <label>Current cash<input id="settingCash" type="number" min="0" step="1" value="${state.currentCash}"></label>
        <label>Emergency buffer<input id="settingBuffer" type="number" min="0" step="1" value="${state.emergencyBuffer}"></label>
        <label>Planned debt payments<input id="settingDebt" type="number" min="0" step="1" value="${state.plannedDebtPayments}"></label>
        <label>Planned savings<input id="settingSavings" type="number" min="0" step="1" value="${state.plannedSavings}"></label>
      </div>
      <div class="dialog-actions" style="margin-top:16px">
        <button class="secondary-button" id="exportData" type="button">Export data</button>
        <label class="secondary-button" for="importDataInput">Import data</label>
        <input id="importDataInput" type="file" accept="application/json" hidden>
        <button class="secondary-button" id="resetData" type="button">Clear all data</button>
        <button class="primary-button" id="saveSettings" type="button">Save Settings</button>
      </div>
    </section>
  `;
}

function panel(title, buttonText, openType, body) {
  return `
    <section class="table-panel">
      <div class="panel-head">
        <h2>${title}</h2>
        <button class="tiny-button" data-open="${openType}" type="button">${buttonText}</button>
      </div>
      <div class="item-list">${body || emptyState("Nothing here yet.")}</div>
    </section>
  `;
}

function emptyState(text) {
  return `<p class="muted">${text}</p>`;
}

function estimateDate(months) {
  if (!months) return "Not set";
  const date = new Date(today);
  date.setMonth(date.getMonth() + months);
  return formatDate(date, { month: "short", year: "numeric" });
}

function monthsUntil(dateString) {
  const due = new Date(`${dateString}T12:00:00`);
  return Math.max(
    1,
    (due.getFullYear() - today.getFullYear()) * 12 +
      due.getMonth() -
      today.getMonth(),
  );
}

function bindContentActions() {
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openDialog(button.dataset.open));
  });

  document.querySelectorAll("[data-pay-bill]").forEach((button) => {
    button.addEventListener("click", () => payBill(button.dataset.payBill));
  });

  document.querySelectorAll("[data-pay-debt]").forEach((button) => {
    button.addEventListener("click", () => payDebt(button.dataset.payDebt));
  });

  document.querySelectorAll("[data-receive-paycheck]").forEach((button) => {
    button.addEventListener("click", () =>
      receivePaycheck(button.dataset.receivePaycheck),
    );
  });

  document.querySelectorAll("[data-edit-paycheck]").forEach((button) => {
    button.addEventListener("click", () =>
      editPaycheck(button.dataset.editPaycheck),
    );
  });

  deleteEntryBtn?.addEventListener("click", () => {
    if (editingEntryId) deletePaycheck(editingEntryId);
  });

  document
    .querySelector("#saveSettings")
    ?.addEventListener("click", saveSettings);
  document.querySelector("#exportData")?.addEventListener("click", exportData);
  document
    .querySelector("#importDataInput")
    ?.addEventListener("change", importDataFile);
  document.querySelector("#resetData")?.addEventListener("click", () => {
    state = structuredClone(seedState);
    saveState();
    render();
  });
}

function exportData() {
  const dateStamp = toDateString(today);
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `moneyos-backup-${dateStamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importDataFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    state = normalizeState(parsed);
    saveState();
    render();
    alert("Data imported successfully.");
  } catch {
    alert("Invalid file. Please import a valid MoneyOS JSON backup.");
  } finally {
    event.target.value = "";
  }
}

function openDialog(type = "paycheck") {
  editingEntryId = null;
  entryType.value = type;
  updateDialogMeta(type);
  buildForm(type);
  entryForm.querySelector("#entryEditId")?.remove();
  setDeleteButtonVisible(false);
  entryDialog.showModal();
}

function editPaycheck(id) {
  const paycheck = state.paychecks.find((item) => item.id === id);
  if (!paycheck) return;
  editingEntryId = id;
  entryType.value = "paycheck";
  updateDialogMeta("paycheck", true);
  buildForm("paycheck");
  setFormValues("paycheck", paycheck);
  ensureEditField(id);
  setDeleteButtonVisible(true);
  entryDialog.showModal();
}

function updateDialogMeta(type, editing = false) {
  const titles = {
    paycheck: "Add Paycheck",
    bill: "Add Bill",
    debt: "Add Debt",
    budget: "Add Budget Category",
    saving: "Add Savings Goal",
    expense: "Add Expense",
  };
  const label =
    editing && type === "paycheck"
      ? "Edit Paycheck"
      : titles[type] || "Add Item";
  if (dialogTitle) dialogTitle.textContent = label;
  if (saveEntryBtn)
    saveEntryBtn.textContent = editing
      ? "Save Changes"
      : label.replace("Add ", "Save ");
}

function setDeleteButtonVisible(visible) {
  deleteEntryBtn?.classList.toggle("hidden", !visible);
}

function buildForm(type) {
  const fields = {
    paycheck: [
      ["employer", "Employer", "text", ""],
      ["payDate", "Pay date", "date", ""],
      ["netEstimate", "Take-home estimate", "number", ""],
      ["regularHours", "Regular hours", "number", ""],
      ["overtimeHours", "Overtime hours", "number", ""],
    ],
    bill: [
      ["name", "Bill name", "text", ""],
      ["category", "Category", "text", ""],
      ["amountDue", "Amount due", "number", ""],
      ["dueDate", "Due date", "date", ""],
      ["priority", "Priority", "text", ""],
    ],
    debt: [
      ["name", "Account name", "text", ""],
      ["type", "Type", "text", ""],
      ["balance", "Current balance", "number", ""],
      ["limit", "Credit limit", "number", ""],
      ["minimumPayment", "Minimum payment", "number", ""],
      ["apr", "APR", "number", ""],
    ],
    budget: [
      ["name", "Category name", "text", ""],
      ["limit", "Monthly limit", "number", ""],
    ],
    saving: [
      ["name", "Goal name", "text", ""],
      ["target", "Target amount", "number", ""],
      ["current", "Current amount", "number", ""],
      ["deadline", "Deadline", "date", ""],
      ["monthlyTarget", "Monthly target", "number", ""],
    ],
    expense: [
      ["description", "Description", "text", ""],
      ["category", "Category", "text", ""],
      ["amount", "Amount", "number", ""],
      ["date", "Date", "date", ""],
    ],
  }[type];

  formFields.innerHTML = fields
    .map(
      ([name, label, inputType, placeholder]) => `
    <label>
      ${label}
      <input name="${name}" type="${inputType}" ${inputType === "number" ? 'step="0.01"' : ""} placeholder="${placeholder}" required>
    </label>
  `,
    )
    .join("");
}

function setFormValues(type, entry) {
  const inputs =
    {
      paycheck: [
        "employer",
        "payDate",
        "netEstimate",
        "regularHours",
        "overtimeHours",
      ],
    }[type] || [];

  inputs.forEach((name) => {
    const field = formFields.querySelector(`[name="${name}"]`);
    if (!field) return;
    field.value = entry[name] ?? "";
  });
}

function ensureEditField(id) {
  const existing = entryForm.querySelector("#entryEditId");
  if (existing) existing.remove();
  const field = document.createElement("input");
  field.type = "hidden";
  field.name = "entryEditId";
  field.id = "entryEditId";
  field.value = id;
  entryForm.appendChild(field);
}

function saveEntry(formData) {
  const type = formData.get("entryType");
  const entry = Object.fromEntries(formData.entries());
  delete entry.entryType;
  const editId = entry.entryEditId;
  delete entry.entryEditId;

  Object.keys(entry).forEach((key) => {
    if (
      [
        "amount",
        "amountDue",
        "netEstimate",
        "regularHours",
        "overtimeHours",
        "balance",
        "limit",
        "minimumPayment",
        "apr",
        "limit",
        "target",
        "current",
        "monthlyTarget",
      ].includes(key)
    ) {
      entry[key] = Number(entry[key]);
    }
  });

  entry.id = crypto.randomUUID();
  if (type === "paycheck") {
    const existingPaycheck = editId
      ? state.paychecks.find((item) => item.id === editId)
      : null;
    const normalizedPaycheck = createRecurringPaycheck({
      ...entry,
      status: existingPaycheck?.status || "expected",
      actualNet: existingPaycheck?.actualNet || 0,
      recurring: true,
      cadenceDays: 14,
      recurringSeriesId:
        existingPaycheck?.recurringSeriesId || crypto.randomUUID(),
    });

    if (editId) {
      updatePaycheck(editId, normalizedPaycheck);
    } else {
      state.paychecks.push(normalizedPaycheck);
      scheduleNextPaycheck(normalizedPaycheck);
    }
  }
  if (type === "bill")
    state.bills.push({
      ...entry,
      paidAmount: 0,
      repeat: "none",
      autopay: false,
    });
  if (type === "debt") state.debts.push(entry);
  if (type === "budget") state.budgetCategories.push(entry);
  if (type === "saving")
    state.savingsGoals.push({ ...entry, priority: "medium" });
  if (type === "expense") state.expenses.push(entry);
  saveState();
  render();
}

function updatePaycheck(id, changes) {
  const paycheck = state.paychecks.find((item) => item.id === id);
  if (!paycheck) return;
  const updated = { ...paycheck, ...changes, id: paycheck.id };
  Object.assign(paycheck, updated);

  if (paycheck.recurring) {
    state.paychecks.forEach((item) => {
      if (
        item.id !== paycheck.id &&
        (item.recurringSeriesId === paycheck.recurringSeriesId ||
          (!item.recurringSeriesId && item.employer === paycheck.employer)) &&
        daysUntil(item.payDate) >= daysUntil(paycheck.payDate)
      ) {
        item.employer = paycheck.employer;
        item.hourlyRate = paycheck.hourlyRate;
        item.regularHours = paycheck.regularHours;
        item.overtimeHours = paycheck.overtimeHours;
        item.grossEstimate = paycheck.grossEstimate;
        item.netEstimate = paycheck.netEstimate;
        item.recurring = true;
        item.cadenceDays = paycheck.cadenceDays;
        item.recurringSeriesId = paycheck.recurringSeriesId;
        if (item.status !== "received") {
          item.actualNet = 0;
        }
      }
    });
  }
}

function deletePaycheck(id) {
  const paycheck = state.paychecks.find((item) => item.id === id);
  if (!paycheck) return;

  const approved = confirm(
    `Delete ${paycheck.employer} on ${formatDate(paycheck.payDate)}?`,
  );
  if (!approved) return;

  state.paychecks = state.paychecks.filter((item) => item.id !== id);
  saveState();
  editingEntryId = null;
  entryForm.reset();
  entryForm.querySelector("#entryEditId")?.remove();
  setDeleteButtonVisible(false);
  entryDialog.close();
  render();
}

function payBill(id) {
  const bill = state.bills.find((item) => item.id === id);
  if (!bill) return;
  const amount = remainingBill(bill);
  bill.paidAmount = Number(bill.amountDue);
  state.currentCash = Math.max(0, state.currentCash - amount);
  state.payments.push({
    id: crypto.randomUUID(),
    date: toDateString(today),
    account: bill.name,
    amount,
    type: "bill",
  });
  saveState();
  render();
}

function payDebt(id) {
  const debt = state.debts.find((item) => item.id === id);
  if (!debt) return;
  const amount = Math.min(
    debt.balance,
    Math.max(debt.minimumPayment || 25, Math.floor(metrics().safeToSpend / 2)),
  );
  debt.balance = Math.max(0, debt.balance - amount);
  state.currentCash = Math.max(0, state.currentCash - amount);
  state.payments.push({
    id: crypto.randomUUID(),
    date: toDateString(today),
    account: debt.name,
    amount,
    type: "debt",
  });
  saveState();
  render();
}

function receivePaycheck(id) {
  const paycheck = state.paychecks.find((item) => item.id === id);
  if (!paycheck) return;
  const amount = paycheck.actualNet || paycheck.netEstimate;
  paycheck.status = "received";
  paycheck.actualNet = amount;
  state.currentCash += amount;
  scheduleNextPaycheck(paycheck);
  saveState();
  render();
}

function createRecurringPaycheck(paycheck) {
  return {
    ...paycheck,
    recurring: paycheck.recurring ?? true,
    cadenceDays: Number(paycheck.cadenceDays) || 14,
    recurringSeriesId: paycheck.recurringSeriesId || crypto.randomUUID(),
  };
}

function scheduleNextPaycheck(paycheck) {
  if (!paycheck.recurring) return;
  const cadenceDays = Number(paycheck.cadenceDays) || 14;
  const nextPayDate = new Date(`${paycheck.payDate}T12:00:00`);
  nextPayDate.setDate(nextPayDate.getDate() + cadenceDays);
  const nextDateString = toDateString(nextPayDate);
  const existing = state.paychecks.find(
    (item) =>
      item.payDate === nextDateString && item.employer === paycheck.employer,
  );
  if (existing) return;

  state.paychecks.push(
    createRecurringPaycheck({
      id: crypto.randomUUID(),
      employer: paycheck.employer,
      payDate: nextDateString,
      hourlyRate: paycheck.hourlyRate,
      regularHours: paycheck.regularHours,
      overtimeHours: paycheck.overtimeHours,
      grossEstimate: paycheck.grossEstimate,
      netEstimate: paycheck.netEstimate,
      actualNet: 0,
      status: "expected",
      recurring: true,
      cadenceDays,
      recurringSeriesId: paycheck.recurringSeriesId,
    }),
  );
}

function saveSettings() {
  state.currentCash = Number(document.querySelector("#settingCash").value);
  state.emergencyBuffer = Number(
    document.querySelector("#settingBuffer").value,
  );
  state.plannedDebtPayments = Number(
    document.querySelector("#settingDebt").value,
  );
  state.plannedSavings = Number(
    document.querySelector("#settingSavings").value,
  );
  saveState();
  render();
}

function setMobileMenu(open) {
  document.body.classList.toggle("menu-open", open);
  menuToggleBtn?.setAttribute("aria-expanded", String(open));
}

navTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  activeTab = button.dataset.tab;
  render();
  setMobileMenu(false);
});

menuToggleBtn?.addEventListener("click", () => {
  setMobileMenu(!document.body.classList.contains("menu-open"));
});

document.addEventListener("click", (event) => {
  if (!document.body.classList.contains("menu-open")) return;
  const clickInSidebar = event.target.closest("#sidebar");
  const clickOnToggle = event.target.closest("#menuToggleBtn");
  if (!clickInSidebar && !clickOnToggle) setMobileMenu(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMobileMenu(false);
});

window.matchMedia("(min-width: 721px)").addEventListener("change", (event) => {
  if (event.matches) setMobileMenu(false);
});

quickAddBtn.addEventListener("click", () => openDialog("paycheck"));
entryType.addEventListener("change", () => {
  updateDialogMeta(entryType.value);
  buildForm(entryType.value);
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    entryForm.reset();
    editingEntryId = null;
    entryForm.querySelector("#entryEditId")?.remove();
    setDeleteButtonVisible(false);
    entryDialog.close();
  });
});
entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEntry(new FormData(entryForm));
  entryForm.reset();
  editingEntryId = null;
  entryForm.querySelector("#entryEditId")?.remove();
  setDeleteButtonVisible(false);
  entryDialog.close();
});

render();
