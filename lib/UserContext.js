import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

const UserContext = createContext(null);

export function useUser() {
  return useContext(UserContext) || {
    user: null, profile: null, userRights: {}, loading: true,
    showProfilePanel: false, signInWithGoogle() {}, signOut() {},
    updateProfile() {}, updateRightStatus() {}, toggleProfilePanel() {},
  };
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userRights, setUserRights] = useState({});
  const [loading, setLoading] = useState(true);
  const [showProfilePanel, setShowProfilePanel] = useState(false);

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
      signInWithGoogle, signOut, updateProfile, updateRightStatus,
      toggleProfilePanel: () => setShowProfilePanel(p => !p),
    }}>
      {children}
    </UserContext.Provider>
  );
}
