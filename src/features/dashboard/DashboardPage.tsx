import { Alert, Empty, Spin } from "antd";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { fetchPeriods } from "../../api";
import { AnomaliesPanel } from "./components/AnomaliesPanel";
import { BaselinePanel } from "./components/BaselinePanel";
import { CategorizationQueue } from "./components/CategorizationQueue";
import { CategoryBreakdown } from "./components/CategoryBreakdown";
import { CommitmentsPanel } from "./components/CommitmentsPanel";
import { DecisionsPanel } from "./components/DecisionsPanel";
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
import { PageSection } from "./components/PageSection";
import { RecurringSpending } from "./components/RecurringSpending";
import { ReviewQueueTable } from "./components/ReviewQueueTable";
import { SummaryMetrics } from "./components/SummaryMetrics";
import { VerdictBand } from "./components/VerdictBand";
import { TransactionsTable } from "./components/TransactionsTable";
import { useDashboardData } from "./hooks/useDashboardData";

/**
 * The cycle the dashboard opens on is asked for rather than assumed.
 *
 * It used to be a date written into this file. That was a deliberate improvement on
 * opening at today - today is usually a cycle that has not closed, and an unbilled month
 * of partial charges reads as a suspiciously good one - but it fixed the problem for
 * exactly one person's data. Anyone else opened on an empty month, which does not look
 * like the wrong month. It looks like a tool that does not work.
 *
 * So: the newest cycle that has anything in it. When nothing does, that fact is worth
 * saying out loud, because a dashboard of zeros is indistinguishable from a broken one.
 */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type StartingPoint =
  | { state: "loading" }
  | { state: "empty" }
  | { state: "ready"; month: string };

/**
 * Decides where to start, and shows nothing else until it knows.
 *
 * Separate from the dashboard itself because the dashboard cannot usefully be rendered
 * without a cycle: every panel would ask the API about a month that is not a month. Making
 * that a second component rather than an early return is also what keeps its hooks
 * unconditional.
 */
export function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const [start, setStart] = useState<StartingPoint>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchPeriods()
      .then((response) => {
        if (cancelled) {
          return;
        }

        const latest = response.periods[0];
        setStart(latest === undefined ? { state: "empty" } : { state: "ready", month: latest });
      })
      .catch(() => {
        /*
         * A dashboard is more useful than an error here: the API being unreachable and the
         * database being empty look the same from outside, and the panels below say which
         * one it is far better than this effect can.
         */
        if (!cancelled) {
          setStart({ state: "ready", month: thisMonth() });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (start.state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spin tip={t("start.loading")} size="large">
          <div className="p-12" />
        </Spin>
      </div>
    );
  }

  if (start.state === "empty") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div className="flex max-w-xl flex-col gap-3 text-left">
              <span className="text-base font-medium">{t("start.emptyTitle")}</span>
              <span className="text-secondary">{t("start.emptyBody")}</span>
              <code className="rounded bg-surface-muted px-3 py-2 text-xs">
                {t("start.emptyCommand")}
              </code>
              <span className="text-secondary text-xs">{t("start.emptyDemo")}</span>
            </div>
          }
        />
      </div>
    );
  }

  return <Dashboard initialMonth={start.month} />;
}

/** Container: owns filter state and hands plain data down to presentational children. */
function Dashboard({ initialMonth }: { initialMonth: string }): ReactElement {
  const { t } = useTranslation();
  const [month, setMonth] = useState(initialMonth);
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

        <PageSection label={t("sections.whereYouAre.label")} purpose={t("sections.whereYouAre.purpose")} />

        <VerdictBand
          month={month}
          cycle={summary?.cycle ?? null}
          commitmentsVersion={commitmentsVersion}
        />

        <SummaryMetrics summary={summary} />
        <ClassificationStrip summary={summary} />

        <PageSection label={t("sections.howOut.label")} purpose={t("sections.howOut.purpose")} />

        <ScorecardPanel month={month} commitmentsVersion={commitmentsVersion} />

        <PayoffPanel month={month} commitmentsVersion={commitmentsVersion} />

        <LeversPanel month={month} commitmentsVersion={commitmentsVersion} />

        <InstallmentCalendar month={month} />

        <BaselinePanel month={month} commitmentsVersion={commitmentsVersion} />

        <PageSection label={t("sections.decided.label")} purpose={t("sections.decided.purpose")} />

        <CommitmentsPanel
          month={month}
          categories={categories}
          onChanged={() => setCommitmentsVersion((version) => version + 1)}
        />

        <PlanNotesPanel />

        <PageSection label={t("sections.whereItGoes.label")} purpose={t("sections.whereItGoes.purpose")} />

        <FoodPanel month={month} />

        <AnomaliesPanel />

        <RecurringSpending />

        <CategoryBreakdown summary={summary} />

        <PageSection label={t("sections.detail.label")} purpose={t("sections.detail.purpose")} />

        <CategorizationQueue categories={categories} onCategorized={refresh} />

        <DecisionsPanel
          onChanged={() => {
            refresh();
            setCommitmentsVersion((version) => version + 1);
          }}
        />

        <NewTransactionForm
          categories={categories}
          accounts={accounts}
          defaultDate={today()}
          isLoading={isLoading}
          onCreated={refresh}
        />

        <ForeignCurrencyPanel />

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

        <ReviewQueueTable records={reviewRecords} isLoading={isLoading} />

      </main>
    </div>
  );
}
