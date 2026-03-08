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
  };
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

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const u = session?.user || null;
        setUser(u);
        if (u) {
          await loadUserData(u.id);
        } else {
          setProfile(null);
          setUserRights({});
        }
        setLoading(false);
        if (event === "SIGNED_IN" && typeof window !== "undefined" && window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  function signOut() {
    // Clear Supabase session from localStorage directly
    const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    try { localStorage.removeItem(storageKey); } catch (e) {}
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
    if (!user) return null;
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
    if (!user) return null;
    const { data } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    return data;
  }

  async function deleteSession(id) {
    if (!user) return;
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
    if (!user) return;
    await supabase.from("chat_sessions").delete().eq("user_id", user.id);
    setChatSessions([]);
  }

  async function saveLegalCase(fields) {
    if (!user) return null;
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
      toggleProfilePanel: () => setShowProfilePanel(p => !p),
    }}>
      {children}
    </UserContext.Provider>
  );
}
