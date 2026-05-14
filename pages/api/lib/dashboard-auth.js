import { getAdminSupabase, getUserSupabase } from "./supabase-admin";

const ALLOWED_ROLES = new Set(["admin", "ministry"]);
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function authenticateDashboard(req, res) {
  const admin = getAdminSupabase();

  const userSb = getUserSupabase(req, res);
  if (!userSb) return { error: "auth_unavailable" };

  const { data: { user }, error: authErr } = await userSb.auth.getUser();
  if (authErr || !user) return { error: "not_authenticated" };

  const { data: profile } = await admin
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    await logAuditEvent(admin, user.id, "access_denied", req);
    return { error: "insufficient_role" };
  }

  const lastActivity = req.headers["x-last-activity"];
  if (lastActivity) {
    const elapsed = Date.now() - parseInt(lastActivity, 10);
    if (elapsed > SESSION_TIMEOUT_MS) {
      await logAuditEvent(admin, user.id, "session_timeout", req);
      return { error: "session_timeout" };
    }
  }

  await logAuditEvent(admin, user.id, "api_access", req);

  return { user, profile };
}

async function logAuditEvent(admin, userId, action, req) {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.socket?.remoteAddress || "unknown";
    await admin.from("dashboard_audit_log").insert({
      user_id: userId,
      action,
      ip_address: ip,
      user_agent: (req.headers["user-agent"] || "").slice(0, 256),
      endpoint: req.url?.split("?")[0] || "",
    });
  } catch {}
}
