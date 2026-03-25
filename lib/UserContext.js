import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

const UserContext = createContext(null);

export function useUser() {
  return useContext(UserContext) || {
    user: null, profile: null, userRights: {}, loading: true,
    showProfilePanel: false, chatSessions: [], userMemory: [],
    legalCase: null, caseReminders: [],
    signInWithGoogle() {}, signOut() {},
    updateProfile() {}, updateRightStatus() {}, toggleProfilePanel() {},
    saveSession() {}, loadSession() {}, deleteSession() {},
    saveMemory() {}, clearMemory() {}, clearAllSessions() {},
    saveLegalCase() {}, dismissReminder() {},
    subscription: null, loadSubscription() {}, refreshTokenBalance() {},
  };
}

const LOCAL_SESSIONS_KEY = "magen_sessions";
const MAX_LOCAL_SESSIONS = 20;

function saveSessionLocal(session) {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    let sessions = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();
    if (session.id) {
      // Update existing
      sessions = sessions.map(s =>
        s.id === session.id
          ? { ...s, messages: session.messages, title: session.title || s.title, updatedAt: now }
          : s
      );
    } else {
      // Create new
      const newSession = {
        id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        hat: session.hat,
        title: session.title || "שיחה ללא כותרת",
        messages: session.messages,
        updatedAt: now,
        created_at: now,
        updated_at: now,
      };
      sessions.unshift(newSession);
      session = newSession;
    }
    // Trim to max
    if (sessions.length > MAX_LOCAL_SESSIONS) {
      sessions = sessions.slice(0, MAX_LOCAL_SESSIONS);
    }
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
    return session;
  } catch (e) {
    console.error("Failed to save session to localStorage:", e);
    return null;
  }
}

function loadSessionsLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw);
    // Return in same shape as Supabase sessions (with updated_at for display)
    return sessions.map(s => ({
      id: s.id,
      hat: s.hat,
      title: s.title,
      created_at: s.created_at || s.updatedAt,
      updated_at: s.updated_at || s.updatedAt,
    }));
  } catch (e) {
    console.error("Failed to load sessions from localStorage:", e);
    return [];
  }
}

function loadSessionLocalById(id) {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    if (!raw) return null;
    const sessions = JSON.parse(raw);
    return sessions.find(s => s.id === id) || null;
  } catch (e) {
    return null;
  }
}

function deleteSessionLocal(id) {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    if (!raw) return;
    const sessions = JSON.parse(raw).filter(s => s.id !== id);
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error("Failed to delete session from localStorage:", e);
  }
}

function clearLocalSessions() {
  try {
    localStorage.removeItem(LOCAL_SESSIONS_KEY);
  } catch (e) {}
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userRights, setUserRights] = useState({});
  const [loading, setLoading] = useState(true);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [chatSessions, setChatSessions] = useState([]);
  const [userMemory, setUserMemory] = useState([]);
  const [legalCase, setLegalCase] = useState(null);
  const [caseReminders, setCaseReminders] = useState([]);
  const [subscription, setSubscription] = useState(null);

  const loadUserData = useCallback(async (userId) => {
    const { data: p } = await supabase
      .from("profiles").select("*").eq("id", userId).maybeSingle();
    if (p) setProfile(p);

    const { data: r } = await supabase
      .from("user_rights").select("right_id, status").eq("user_id", userId);
    if (r) {
      const map = {};
      r.forEach(x => { map[x.right_id] = x.status; });
      setUserRights(map);
    }

    // Load chat sessions list
    const { data: sessions } = await supabase
      .from("chat_sessions")
      .select("id, hat, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (sessions) setChatSessions(sessions);

    // Load memory
    const { data: mem } = await supabase
      .from("user_memory")
      .select("key, value")
      .eq("user_id", userId);
    if (mem) setUserMemory(mem);

    // Load legal case + reminders
    const { data: lc } = await supabase
      .from("legal_cases")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (lc) {
      setLegalCase(lc);
      const { data: rems } = await supabase
        .from("case_reminders")
        .select("*")
        .eq("user_id", userId)
        .eq("dismissed", false)
        .order("due_date", { ascending: true });
      if (rems) setCaseReminders(rems);
    } else {
      setLegalCase(null);
      setCaseReminders([]);
    }
  }, []);

  const syncLocalSessionsToCloud = useCallback(async (userId) => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_SESSIONS_KEY) : null;
      if (!raw) return;
      const localSessions = JSON.parse(raw);
      if (!localSessions.length) return;
      for (const sess of localSessions) {
        await supabase
          .from("chat_sessions")
          .insert({
            user_id: userId,
            hat: sess.hat,
            title: sess.title,
            messages: sess.messages,
          });
      }
      clearLocalSessions();
    } catch (e) {
      console.error("Failed to sync local sessions to cloud:", e);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // No Supabase — load from localStorage
      if (typeof window !== "undefined") {
        setChatSessions(loadSessionsLocal());
      }
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const u = session?.user || null;
        setUser(u);
        if (u) {
          // Sync local sessions to cloud on login
          if (event === "SIGNED_IN") {
            await syncLocalSessionsToCloud(u.id);
          }
          await loadUserData(u.id);
        } else {
          setProfile(null);
          setUserRights({});
          // Load local data for anonymous users
          if (typeof window !== "undefined") {
            setChatSessions(loadSessionsLocal());
            try {
              const lc = localStorage.getItem("magen_legal_case");
              if (lc) setLegalCase(JSON.parse(lc));
            } catch {}
          }
        }
        setLoading(false);
        if (event === "SIGNED_IN" && typeof window !== "undefined" && window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadUserData, syncLocalSessionsToCloud]);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setUserRights({});
    setShowProfilePanel(false);
    setLegalCase(null);
    setCaseReminders([]);
  }

  async function updateProfile(fields) {
    if (!user) return {};
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", user.id).select().single();
    if (data) setProfile(data);
    return { data, error };
  }

  async function saveSession(session) {
    if (!user) {
      // Save to localStorage for anonymous users
      const saved = saveSessionLocal(session);
      if (saved) {
        const now = new Date().toISOString();
        if (session.id) {
          setChatSessions(prev => prev.map(s =>
            s.id === session.id ? { ...s, title: session.title || s.title, updated_at: now } : s
          ));
        } else {
          setChatSessions(prev => [{
            id: saved.id, hat: saved.hat, title: saved.title,
            created_at: now, updated_at: now,
          }, ...prev]);
        }
      }
      return saved;
    }
    if (session.id) {
      // Update existing
      const { data } = await supabase
        .from("chat_sessions")
        .update({ messages: session.messages, title: session.title })
        .eq("id", session.id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (data) setChatSessions(prev => prev.map(s => s.id === data.id ? { ...s, title: data.title, updated_at: data.updated_at } : s));
      return data;
    } else {
      // Create new
      const { data } = await supabase
        .from("chat_sessions")
        .insert({ user_id: user.id, hat: session.hat, title: session.title, messages: session.messages })
        .select()
        .single();
      if (data) setChatSessions(prev => [{ id: data.id, hat: data.hat, title: data.title, created_at: data.created_at, updated_at: data.updated_at }, ...prev]);
      return data;
    }
  }

  async function loadSession(id) {
    if (!user) {
      // Load from localStorage for anonymous users
      return loadSessionLocalById(id);
    }
    const { data } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    return data;
  }

  async function deleteSession(id) {
    if (!user) {
      deleteSessionLocal(id);
      setChatSessions(prev => prev.filter(s => s.id !== id));
      return;
    }
    await supabase.from("chat_sessions").delete().eq("id", id).eq("user_id", user.id);
    setChatSessions(prev => prev.filter(s => s.id !== id));
  }

  async function saveMemory(facts) {
    if (!user || !facts.length) return;
    for (const f of facts) {
      await supabase
        .from("user_memory")
        .upsert({ user_id: user.id, key: f.key, value: f.value }, { onConflict: "user_id,key" });
    }
    // Reload memory
    const { data: mem } = await supabase.from("user_memory").select("key, value").eq("user_id", user.id);
    if (mem) setUserMemory(mem);
  }

  async function clearMemory() {
    if (!user) return;
    await supabase.from("user_memory").delete().eq("user_id", user.id);
    setUserMemory([]);
  }

  async function clearAllSessions() {
    if (!user) {
      clearLocalSessions();
      setChatSessions([]);
      return;
    }
    await supabase.from("chat_sessions").delete().eq("user_id", user.id);
    setChatSessions([]);
  }

  async function saveLegalCase(fields) {
    if (!user) {
      // localStorage fallback for anonymous users
      try {
        const local = { ...fields, id: "local-case", updated_at: new Date().toISOString() };
        localStorage.setItem("magen_legal_case", JSON.stringify(local));
        setLegalCase(local);
        return { data: local, error: null };
      } catch { return null; }
    }
    if (legalCase) {
      // Update existing
      const { data, error } = await supabase
        .from("legal_cases")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select()
        .single();
      if (data) setLegalCase(data);
      return { data, error };
    } else {
      // Create new
      const { data, error } = await supabase
        .from("legal_cases")
        .insert({ user_id: user.id, ...fields })
        .select()
        .single();
      if (data) setLegalCase(data);
      return { data, error };
    }
  }

  async function dismissReminder(id) {
    if (!user) return;
    await supabase
      .from("case_reminders")
      .update({ dismissed: true })
      .eq("id", id)
      .eq("user_id", user.id);
    setCaseReminders(prev => prev.filter(r => r.id !== id));
  }

  async function loadSubscription() {
    if (!user) return null;
    try {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("*, subscription_plans(*)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setSubscription(data);
      return data;
    } catch { return null; }
  }

  function refreshTokenBalance(tokenInfo) {
    if (!tokenInfo) return;
    setSubscription(prev => ({
      ...(prev || {}),
      remaining: tokenInfo.remaining,
      unlimited: tokenInfo.remaining === -1,
      plan_id: tokenInfo.plan || (prev && prev.plan_id) || "free",
    }));
  }

  async function updateRightStatus(rightId, status) {
    if (!user) return {};
    const { data, error } = await supabase
      .from("user_rights")
      .upsert(
        { user_id: user.id, right_id: rightId, status, updated_at: new Date().toISOString() },
        { onConflict: "user_id,right_id" }
      ).select().single();
    if (data) setUserRights(prev => ({ ...prev, [rightId]: status }));
    return { data, error };
  }

  return (
    <UserContext.Provider value={{
      user, profile, userRights, loading, showProfilePanel,
      chatSessions, userMemory, legalCase, caseReminders,
      signInWithGoogle, signOut, updateProfile, updateRightStatus,
      saveSession, loadSession, deleteSession,
      saveMemory, clearMemory, clearAllSessions,
      saveLegalCase, dismissReminder,
      subscription, loadSubscription, refreshTokenBalance,
      toggleProfilePanel: () => setShowProfilePanel(p => !p),
    }}>
      {children}
    </UserContext.Provider>
  );
}
