import { getUserSupabase } from "../lib/supabase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const userSb = getUserSupabase(req, res);
  if (!userSb) return res.status(401).json({ error: "unauthorized" });

  let user;
  try {
    const { data } = await userSb.auth.getUser();
    user = data?.user;
  } catch {}
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const { sessionId, x, y, text, key } = req.body;
  if (!sessionId) return res.status(400).json({ error: "missing sessionId" });

  try {
    const { getSession } = require("../../../lib/browser-agent/session");
    const session = getSession(sessionId);
    if (!session || session.userId !== user.id) {
      return res.status(404).json({ error: "session not found" });
    }

    const page = session.page;

    if (typeof x === "number" && typeof y === "number") {
      await page.mouse.click(x, y);
      await page.waitForTimeout(500);
    }

    if (text) {
      await page.keyboard.type(text);
      await page.waitForTimeout(300);
    }

    if (key) {
      const keyMap = {
        "Backspace": "Backspace", "Enter": "Enter", "Tab": "Tab",
        "Escape": "Escape", "ArrowLeft": "ArrowLeft", "ArrowRight": "ArrowRight",
        "ArrowUp": "ArrowUp", "ArrowDown": "ArrowDown", "Delete": "Delete",
      };
      if (keyMap[key]) {
        await page.keyboard.press(keyMap[key]);
      } else if (key.length === 1) {
        await page.keyboard.type(key);
      }
      await page.waitForTimeout(100);
    }

    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    // Wait a bit and retry if page looks blank (transition)
    let screenshot;
    for (let i = 0; i < 2; i++) {
      await page.waitForTimeout(500);
      screenshot = (await page.screenshot({ type: "png" })).toString("base64");
      const bodyLen = await page.evaluate(() => document.body?.innerText?.trim()?.length || 0).catch(() => 0);
      if (bodyLen > 30) break;
      await page.waitForTimeout(1500);
    }

    // Check if we've passed login
    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.includes("login") && !currentUrl.includes("authorize") && currentUrl.includes("myshikum");

    return res.status(200).json({
      screenshot,
      url: currentUrl,
      loggedIn: isLoggedIn,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
