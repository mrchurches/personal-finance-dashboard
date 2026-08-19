import { useCallback, useEffect, useState } from "react";
import {
  fetchAccounts,
  fetchCategories,
  fetchReviewQueue,
  fetchSummary,
  fetchTransactions,
} from "@/api";
import type { Account, Category, SourceRecord, Summary, Transaction } from "@shared/types";

export interface DashboardFilters {
  month: string;
  categoryId: string;
  accountId: string;
}

export interface DashboardData {
  summary: Summary | null;
  transactions: Transaction[];
  reviewRecords: SourceRecord[];
  categories: Category[];
  accounts: Account[];
  isLoading: boolean;
  error: string;
  refresh: () => void;
}

/**
 * Owns every read the dashboard needs. Reference data (categories, accounts) is
 * loaded once; the month-scoped views reload whenever a filter or `refresh` changes.
 */
export function useDashboardData(filters: DashboardFilters): DashboardData {
  const { month, categoryId, accountId } = filters;

  const [summary, setSummary] = useState<Summary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reviewRecords, setReviewRecords] = useState<SourceRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  useEffect(() => {
    let isActive = true;

    void Promise.all([fetchCategories(), fetchAccounts()])
      .then(([categoryResponse, accountResponse]) => {
        if (!isActive) {
          return;
        }

        setCategories(categoryResponse.categories);
        setAccounts(accountResponse.accounts);
      })
      .catch((loadError: Error) => {
        if (isActive) {
          setError(loadError.message);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);

    void Promise.all([
      fetchSummary(month),
      fetchTransactions(month, categoryId, accountId),
      fetchReviewQueue(month),
    ])
      .then(([summaryResponse, transactionResponse, reviewResponse]) => {
        if (!isActive) {
          return;
        }

        setSummary(summaryResponse);
        setTransactions(transactionResponse.transactions);
        setReviewRecords(reviewResponse.records);
        setError("");
      })
      .catch((loadError: Error) => {
        if (isActive) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [month, categoryId, accountId, refreshToken]);

  return {
    summary,
    transactions,
    reviewRecords,
    categories,
    accounts,
    isLoading,
    error,
    refresh,
  };
}
