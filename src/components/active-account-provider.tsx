import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTradingAccounts } from "@/lib/trading-accounts.functions";
import {
  ALL_ACCOUNTS,
  activeAccountStorageKey,
  normalizeActiveAccountId,
} from "@/lib/active-account";

type ActiveAccountContextValue = {
  activeAccountId: string;
  setActiveAccountId: (accountId: string) => void;
};

const ActiveAccountContext = createContext<ActiveAccountContextValue | null>(null);

export function ActiveAccountProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const listAccounts = useServerFn(listTradingAccounts);
  const { data: accounts } = useQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => listAccounts(),
  });
  const storageKey = activeAccountStorageKey(userId);
  const [activeAccountId, setActiveAccountIdState] = useState(() => {
    if (typeof window === "undefined") return ALL_ACCOUNTS;
    try {
      return window.localStorage.getItem(storageKey) || ALL_ACCOUNTS;
    } catch {
      return ALL_ACCOUNTS;
    }
  });

  const setActiveAccountId = useCallback(
    (accountId: string) => {
      const next = accounts
        ? normalizeActiveAccountId(accountId, accounts)
        : accountId || ALL_ACCOUNTS;
      setActiveAccountIdState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Persistence is a convenience; shared in-memory state remains authoritative.
      }
    },
    [accounts, storageKey],
  );

  useEffect(() => {
    if (!accounts) return;
    const next = normalizeActiveAccountId(activeAccountId, accounts);
    if (next !== activeAccountId) setActiveAccountId(next);
  }, [accounts, activeAccountId, setActiveAccountId]);

  const value = useMemo(
    () => ({ activeAccountId, setActiveAccountId }),
    [activeAccountId, setActiveAccountId],
  );
  return <ActiveAccountContext.Provider value={value}>{children}</ActiveAccountContext.Provider>;
}

export function useActiveAccount() {
  const value = useContext(ActiveAccountContext);
  if (!value) throw new Error("useActiveAccount must be used within ActiveAccountProvider");
  return value;
}
