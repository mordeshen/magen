import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

const defaultValue = {
  user: null, profile: null, userRights: {}, loading: true,
  showProfilePanel: false, signInWithGoogle() {}, signInWithApple() {},
  signOut() {}, updateProfile() {}, updateRightStatus() {},
  toggleProfilePanel() {},
};

const UserContext = createContext(defaultValue);

export function useUser() {
  return useContext(UserContext) || defaultValue;
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userRights, setUserRights] = useState({});
  const [loading, setLoading] = useState(true);
  const [showProfilePanel, setShowProfilePanel] = useState(false);

  // Fetch profile with retry (trigger may not have run yet)
  const fetchProfile = useCallback(async (userId, retries = 3) => {
    try {
      for (let i = 0; i < retries; i++) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();
        if (data) {
          setProfile(data);
          return data;
        }
        if (i < retries - 1) await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.warn("fetchProfile error:", err);
    }
    return null;
  }, []);

  // Fetch user rights
  const fetchUserRights = useCallback(async (userId) => {
    try {
      const { data } = await supabase
        .from("user_rights")
        .select("right_id, status")
        .eq("user_id", userId);
      if (data) {
        const map = {};
        data.forEach(r => { map[r.right_id] = r.status; });
        setUserRights(map);
      }
    } catch (err) {
      console.warn("fetchUserRights error:", err);
    }
  }, []);

  // Init: check session + listen for auth changes
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;

    // Get initial session
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const session = data?.session;
        const u = session?.user || null;
        setUser(u);
        if (u) {
          fetchProfile(u.id);
          fetchUserRights(u.id);
        }
      })
      .catch((err) => {
        console.warn("getSession error:", err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        try {
          const u = session?.user || null;
          setUser(u);
          if (u) {
            await fetchProfile(u.id);
            await fetchUserRights(u.id);
          } else {
            setProfile(null);
            setUserRights({});
          }
        } catch (err) {
          console.warn("onAuthStateChange error:", err);
        }
      }
    );

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [fetchProfile, fetchUserRights]);

  // Auth functions
  async function signInWithGoogle() {
    if (!supabase) return;
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
    } catch (err) {
      console.warn("signInWithGoogle error:", err);
    }
  }

  async function signInWithApple() {
    if (!supabase) return;
    try {
      await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: window.location.origin },
      });
    } catch (err) {
      console.warn("signInWithApple error:", err);
    }
  }

  async function signOut() {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("signOut error:", err);
    }
    setUser(null);
    setProfile(null);
    setUserRights({});
    setShowProfilePanel(false);
  }

  // Profile update
  async function updateProfile(fields) {
    if (!user || !supabase) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .select()
        .single();
      if (data) setProfile(data);
      return { data, error };
    } catch (err) {
      console.warn("updateProfile error:", err);
      return { data: null, error: err };
    }
  }

  // Right status upsert
  async function updateRightStatus(rightId, status) {
    if (!user || !supabase) return;
    try {
      const { data, error } = await supabase
        .from("user_rights")
        .upsert(
          { user_id: user.id, right_id: rightId, status, updated_at: new Date().toISOString() },
          { onConflict: "user_id,right_id" }
        )
        .select()
        .single();
      if (data) {
        setUserRights(prev => ({ ...prev, [rightId]: status }));
      }
      return { data, error };
    } catch (err) {
      console.warn("updateRightStatus error:", err);
      return { data: null, error: err };
    }
  }

  function toggleProfilePanel() {
    setShowProfilePanel(prev => !prev);
  }

  return (
    <UserContext.Provider
      value={{
        user,
        profile,
        userRights,
        loading,
        showProfilePanel,
        signInWithGoogle,
        signInWithApple,
        signOut,
        updateProfile,
        updateRightStatus,
        toggleProfilePanel,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
