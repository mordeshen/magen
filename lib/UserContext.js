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

    // Handle hash token manually if Supabase didn't pick it up
    async function initSession() {
      try {
        // First try normal getSession
        const { data } = await supabase.auth.getSession();
        let session = data?.session;

        // If no session but hash has access_token, extract and set manually
        if (!session && typeof window !== "undefined" && window.location.hash.includes("access_token")) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const { data: sessionData } = await supabase.auth.setSession({ access_token, refresh_token });
            session = sessionData?.session;
          }
          // Clean hash from URL
          window.history.replaceState(null, "", window.location.pathname);
        }

        if (!mounted) return;
        const u = session?.user || null;
        setUser(u);
        if (u) {
          fetchProfile(u.id);
          fetchUserRights(u.id);
        }
      } catch (err) {
        console.warn("initSession error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initSession();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
          // Clean token from URL after sign-in
          if (event === "SIGNED_IN" && window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname);
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
