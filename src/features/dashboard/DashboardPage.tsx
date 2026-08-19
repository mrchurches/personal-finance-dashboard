import { Alert } from "antd";
import { useState, type ReactElement } from "react";
import { AnomaliesPanel } from "./components/AnomaliesPanel";
import { BaselinePanel } from "./components/BaselinePanel";
import { CategorizationQueue } from "./components/CategorizationQueue";
import { CategoryBreakdown } from "./components/CategoryBreakdown";
import { CommitmentsPanel } from "./components/CommitmentsPanel";
import { PlanNotesPanel } from "./components/PlanNotesPanel";
import { ScorecardPanel } from "./components/ScorecardPanel";
import { FoodPanel } from "./components/FoodPanel";
import { ForeignCurrencyPanel } from "./components/ForeignCurrencyPanel";
import { InstallmentCalendar } from "./components/InstallmentCalendar";
import { LeversPanel } from "./components/LeversPanel";
import { PayoffPanel } from "./components/PayoffPanel";
import { ClassificationStrip } from "./components/ClassificationStrip";
import { DashboardHeader } from "./components/DashboardHeader";
import { NewTransactionForm } from "./components/NewTransactionForm";
import { RecurringSpending } from "./components/RecurringSpending";
import { ReviewQueueTable } from "./components/ReviewQueueTable";
import { SummaryMetrics } from "./components/SummaryMetrics";
import { TransactionsTable } from "./components/TransactionsTable";
import { useDashboardData } from "./hooks/useDashboardData";

/*
 * Kept from the previous implementation on purpose: both values are pinned to the
 * seeded statement period rather than to "today", so the dashboard opens on a
 * month that actually has data.
 */
const DEFAULT_MONTH = "2026-08";
const DEFAULT_DATE = "2026-08-18";

/** Container: owns filter state and hands plain data down to presentational children. */
export function DashboardPage(): ReactElement {
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [commitmentsVersion, setCommitmentsVersion] = useState(0);

  const {
    summary,
    transactions,
    reviewRecords,
    categories,
    accounts,
    isLoading,
    error,
    refresh,
  } = useDashboardData({ month, categoryId: categoryFilter, accountId: accountFilter });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader month={month} cycle={summary?.cycle ?? null} onMonthChange={setMonth} />

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 sm:px-10">
        {error.length > 0 && <Alert type="error" showIcon message={error} />}

        <SummaryMetrics summary={summary} />
        <ClassificationStrip summary={summary} />

        <CategorizationQueue categories={categories} onCategorized={refresh} />

        <CommitmentsPanel
          month={month}
          categories={categories}
          onChanged={() => setCommitmentsVersion((version) => version + 1)}
        />

        <ScorecardPanel month={month} commitmentsVersion={commitmentsVersion} />

        <PayoffPanel month={month} commitmentsVersion={commitmentsVersion} />

        <LeversPanel month={month} commitmentsVersion={commitmentsVersion} />

        <BaselinePanel month={month} commitmentsVersion={commitmentsVersion} />

        <InstallmentCalendar month={month} />

        <AnomaliesPanel />

        <FoodPanel month={month} />

        <ForeignCurrencyPanel />

        <RecurringSpending />

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[3fr_2fr]">
          <CategoryBreakdown summary={summary} />
          <NewTransactionForm
            categories={categories}
            accounts={accounts}
            defaultDate={DEFAULT_DATE}
            isLoading={isLoading}
            onCreated={refresh}
          />
        </div>

        <TransactionsTable
          transactions={transactions}
          categories={categories}
          accounts={accounts}
          categoryFilter={categoryFilter}
          accountFilter={accountFilter}
          isLoading={isLoading}
          onCategoryFilterChange={setCategoryFilter}
          onAccountFilterChange={setAccountFilter}
          onCategorized={refresh}
        />

        <PlanNotesPanel />

        <ReviewQueueTable records={reviewRecords} isLoading={isLoading} />
      </main>
    </div>
  );
}
