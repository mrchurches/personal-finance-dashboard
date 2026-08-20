import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { formatMoney } from "@shared/money";
import type { Currency } from "@shared/types";

const STORAGE_KEY = "personal-finance-dashboard:amounts-hidden";

interface PrivacyContextValue {
  areAmountsHidden: boolean;
  toggleAmounts: () => void;
  /** Formats money, or masks it, depending on the toggle. */
  money: (amountMinor: number, currency: Currency) => string;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

/**
 * The mask keeps the currency and hides the figure.
 *
 * Not a blur: blurred text is still in the page, still selectable, and still readable
 * from a screenshot taken at the wrong moment. Replacing the digits means the number is
 * genuinely not on screen, which is the only version of this that can be trusted while
 * someone is looking over your shoulder.
 *
 * The width is fixed rather than proportional to the amount, because a longer mask would
 * leak the magnitude - which is most of what the reader was hiding.
 */
const MASK = "●●●●●";

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    /* Private browsing and blocked storage both throw. Neither is worth failing over. */
    return false;
  }
}

/**
 * Hides every amount on the page behind one switch.
 *
 * Useful for two different things that happen to need the same mechanism: showing the
 * tool to someone without showing them your debt, and taking a screenshot of a personal
 * finance dashboard that can safely leave the machine.
 */
export function PrivacyProvider({ children }: PropsWithChildren): ReactElement {
  const [areAmountsHidden, setAreAmountsHidden] = useState(readStoredPreference);

  const toggleAmounts = useCallback(() => {
    setAreAmountsHidden((hidden) => {
      const next = !hidden;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* The preference is a convenience; losing it must not break the page. */
      }
      return next;
    });
  }, []);

  const value = useMemo<PrivacyContextValue>(
    () => ({
      areAmountsHidden,
      toggleAmounts,
      money: (amountMinor, currency) =>
        areAmountsHidden ? `${currency} ${MASK}` : formatMoney(amountMinor, currency),
    }),
    [areAmountsHidden, toggleAmounts],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

/**
 * The one way a component should turn minor units into text.
 *
 * Importing `formatMoney` directly bypasses the switch, which is why nothing under this
 * provider does it any more: a single panel that forgot would be the one figure left on
 * screen, and the reader would have no way to know which.
 */
export function usePrivacy(): PrivacyContextValue {
  const value = useContext(PrivacyContext);
  if (value === null) {
    throw new Error("usePrivacy must be used inside a PrivacyProvider.");
  }

  return value;
}
