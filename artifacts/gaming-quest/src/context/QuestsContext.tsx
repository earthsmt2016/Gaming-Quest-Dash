import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Quest, QuestLog, UserProfile,
  fetchActiveQuests, fetchSuggestedQuests, fetchQuestLogs, fetchUserProfile,
} from '../lib/api';

const POLL_INTERVAL_MS = 60_000;

interface QuestsContextValue {
  active: Quest[];
  suggested: Quest[];
  logs: QuestLog[];
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActive: React.Dispatch<React.SetStateAction<Quest[]>>;
  setSuggested: React.Dispatch<React.SetStateAction<Quest[]>>;
  setLogs: React.Dispatch<React.SetStateAction<QuestLog[]>>;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const QuestsContext = createContext<QuestsContextValue | null>(null);

export function QuestsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Quest[]>([]);
  const [suggested, setSuggested] = useState<Quest[]>([]);
  const [logs, setLogs] = useState<QuestLog[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [s, a, l, p] = await Promise.all([
        fetchSuggestedQuests(),
        fetchActiveQuests(),
        fetchQuestLogs(),
        fetchUserProfile(),
      ]);
      setSuggested(s);
      setActive(a);
      setLogs(l);
      setProfile(p);
    } finally {
      if (firstLoad.current) {
        setLoading(false);
        firstLoad.current = false;
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <QuestsContext.Provider value={{ active, suggested, logs, profile, loading, refresh, setActive, setSuggested, setLogs, setProfile }}>
      {children}
    </QuestsContext.Provider>
  );
}

export function useQuestsContext(): QuestsContextValue {
  const ctx = useContext(QuestsContext);
  if (!ctx) throw new Error('useQuestsContext must be used inside QuestsProvider');
  return ctx;
}
