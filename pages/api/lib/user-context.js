// Single source of truth for server-side user data fetching.
// Used by both chat.js and whatsapp.js — same tables, same columns, same shape.

/**
 * @param {SupabaseClient} supabase - Admin Supabase client
 * @param {string|null} userId - The user's UUID (null = anonymous)
 * @returns {Promise<{profile, legalCase, injuries, memory}>}
 */
export async function fetchUserContext(supabase, userId) {
  const empty = { profile: null, legalCase: null, injuries: [], memory: [] };

  if (!supabase || !userId) return empty;

  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Supabase timeout (8s)")), 8000)
    );

    const queries = Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("legal_cases").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("injuries")
        .select("body_zone, hebrew_label, severity, status, details, disability_percent")
        .eq("user_id", userId).limit(20),
      supabase.from("user_memory").select("key, value").eq("user_id", userId).limit(20),
    ]);

    const [profileRes, legalRes, injuryRes, memoryRes] = await Promise.race([queries, timeout]);

    if (profileRes.error) console.error("[user-context] profile error:", profileRes.error);
    if (legalRes.error) console.error("[user-context] legalCase error:", legalRes.error);
    if (injuryRes.error) console.error("[user-context] injuries error:", injuryRes.error);
    if (memoryRes.error) console.error("[user-context] memory error:", memoryRes.error);

    const ctx = {
      profile: profileRes.data || null,
      legalCase: legalRes.data || null,
      injuries: injuryRes.data || [],
      memory: memoryRes.data || [],
    };

    console.log(`[user-context] userId=${userId} → profile=${!!ctx.profile}, legalCase=${!!ctx.legalCase}, injuries=${ctx.injuries.length}, memory=${ctx.memory.length}`);
    return ctx;
  } catch (e) {
    console.error("[user-context] FAILED, returning empty context:", e.message);
    return empty;
  }
}
