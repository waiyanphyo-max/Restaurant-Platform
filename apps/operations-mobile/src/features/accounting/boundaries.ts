/** Architecture inventory for M8/M9; not a navigation permission or live API. */
export const accountingBoundaries = [
  { id: "sales-dashboard", title: "Sales Dashboard", readiness: "requires-backend", responsibilities: ["daily/monthly/yearly revenue", "trends", "order counts"] },
  { id: "sales-history", title: "Detailed Sales History", readiness: "partial-operational-data", responsibilities: ["historical line snapshots", "payments/refunds/cancellations", "authorized staff", "search/date filters"] },
  { id: "shopping", title: "Smart Daily Shopping", readiness: "requires-backend", responsibilities: ["persistent catalog", "daily quantities and units", "seven-day inactivity suggestions", "search/reactivation"] },
  { id: "purchase-history", title: "Detailed Purchase History", readiness: "requires-backend", responsibilities: ["purchase snapshots", "supplier and cost", "payment status", "private receipts"] },
  { id: "expenses", title: "Expense Management", readiness: "requires-backend", responsibilities: ["rent", "salaries", "utilities", "transport", "packaging", "maintenance", "other"] },
  { id: "cashbook", title: "Cashbook and Reconciliation", readiness: "requires-backend", responsibilities: ["opening/receipts/payouts", "expected and actual closing", "difference", "closing history"] },
  { id: "financial-reports", title: "Financial Reporting", readiness: "requires-backend", responsibilities: ["revenue/purchases/expenses", "cash flow", "reliable profit and loss only", "date/month/year filters", "CSV export"] },
  { id: "suppliers", title: "Supplier and Payable Management", readiness: "requires-backend", responsibilities: ["supplier catalog", "supplier purchases", "payments/allocations", "outstanding balances"] },
  { id: "audit", title: "Accounting Audit History", readiness: "requires-backend", responsibilities: ["actors/timestamps", "change reasons", "reversals/corrections"] },
] as const;

export type AccountingBoundaryId = typeof accountingBoundaries[number]["id"];
export const accountingAudience = ["OWNER", "MANAGER"] as const;
