import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const code = router.query.code;
    if (!code || !supabase) return;

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) console.warn("exchangeCodeForSession error:", error);
      router.replace("/");
    });
  }, [router, router.query.code]);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#0a0e14", color: "#dde3ec",
      fontFamily: "Heebo, sans-serif", fontSize: "18px",
    }}>
      מתחבר...
    </div>
  );
}
