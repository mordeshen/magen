import { getUserSupabase } from "../lib/supabase-admin";
import { alertDev } from "../lib/alert";

// OTP-based login flow for myshikum.mod.gov.il:
// Step 1: POST with { sessionId, idNumber } → enters ID, clicks OTP button → user gets SMS
// Step 2: POST with { sessionId, otpCode } → enters OTP code → completes login

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

  const { sessionId, idNumber, phoneNumber, otpCode } = req.body;
  if (!sessionId) return res.status(400).json({ error: "missing sessionId" });

  try {
    const { getSession } = require("../../../lib/browser-agent/session");

    const session = getSession(sessionId);
    if (!session || session.userId !== user.id) {
      return res.status(404).json({ error: "session not found" });
    }

    const page = session.page;

    // Step 1: Enter ID number and request OTP
    if (idNumber && !otpCode) {
      // Fill ID number field
      const idFilled = await tryFill(page, [
        "#login-by-id-number",
        "#idNumber",
        'input[placeholder*="תעודת זהות"]',
        'input[type="number"]',
      ], idNumber);

      if (!idFilled) {
        const screenshot = (await page.screenshot({ type: "png" })).toString("base64");
        return res.status(200).json({
          step: "error",
          screenshot,
          message: "לא מצאתי את שדה תעודת הזהות. האתר אולי השתנה.",
        });
      }

      // Click OTP button
      await tryClick(page, [
        "#button-id-by-otp",
        'button[type="submit"]',
        'button:has-text("התחברות עם קוד")',
        'button:has-text("קוד חד פעמי")',
      ]);

      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const screenshot = (await page.screenshot({ type: "png" })).toString("base64");

      session.status = "waiting_phone";
      return res.status(200).json({
        step: "need_phone",
        screenshot,
        message: "הכנס את מספר הטלפון הנייד שרשום אצל אגף השיקום.",
      });
    }

    // Step 2: Enter phone number and send OTP
    if (phoneNumber && !otpCode) {
      // Make sure "נייד" radio is selected
      await tryClick(page, [
        'input[value="phone"]',
        'label:has-text("נייד")',
        'input[type="radio"]:checked',
      ]);

      // Fill phone number
      await tryFill(page, [
        'input[placeholder*="טלפון"]',
        'input[placeholder*="נייד"]',
        'input[type="tel"]',
        'input[type="text"]:not(#idNumber):not(#login-by-id-number)',
      ], phoneNumber);

      // Click "המשך"
      await tryClick(page, [
        'button:has-text("המשך")',
        'button[type="submit"]',
        'button:has-text("שלח")',
      ]);

      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3000);

      // Retry screenshot if page is blank
      let screenshot;
      for (let attempt = 0; attempt < 3; attempt++) {
        screenshot = (await page.screenshot({ type: "png" })).toString("base64");
        const bodyText = await page.textContent("body").catch(() => "");
        if (bodyText.trim().length > 50) break;
        await page.waitForTimeout(2000);
      }

      session.status = "waiting_otp";
      return res.status(200).json({
        step: "otp_sent",
        screenshot,
        message: "נשלח קוד חד-פעמי. אפשר להכניס את הקוד כאן למטה, או ללחוץ ישירות על המסך.",
      });
    }

    // Step 3: Enter OTP code
    if (otpCode) {
      // Wait for the OTP input page to be ready
      await page.waitForTimeout(1000);

      // Find OTP input field — try multiple selectors
      const otpFilled = await tryFill(page, [
        "#otpCode",
        "#otp",
        'input[placeholder*="קוד"]',
        'input[placeholder*="חד"]',
        'input[placeholder*="אימות"]',
        'input[type="text"]:not(#idNumber):not(#login-by-id-number):not([placeholder*="טלפון"])',
        'input[type="number"]:not(#login-by-id-number)',
        'input[type="tel"]:not([placeholder*="טלפון"])',
      ], otpCode);

      if (!otpFilled) {
        const screenshot = (await page.screenshot({ type: "png" })).toString("base64");
        return res.status(200).json({
          step: "error",
          screenshot,
          message: "לא מצאתי את שדה הקוד. נסה שוב.",
        });
      }

      // Click submit/confirm
      await tryClick(page, [
        'button[type="submit"]',
        'button:has-text("אישור")',
        'button:has-text("כניסה")',
        'button:has-text("אימות")',
      ]);

      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);

      const screenshot = (await page.screenshot({ type: "png" })).toString("base64");
      const currentUrl = page.url();

      // Check if we're past the login page
      const isLoggedIn = !currentUrl.includes("login") && !currentUrl.includes("authorize");

      if (isLoggedIn) {
        session.status = "active";
        return res.status(200).json({
          step: "logged_in",
          screenshot,
          message: "מחובר בהצלחה! עכשיו אני מתחיל לעבוד על המשימה שלך.",
          success: true,
        });
      } else {
        const bodyText = await page.textContent("body").catch(() => "");
        const hasError = bodyText.includes("שגיאה") || bodyText.includes("שגוי") || bodyText.includes("נכשל");
        session.status = "waiting_otp";
        return res.status(200).json({
          step: "otp_failed",
          screenshot,
          message: hasError ? "הקוד לא נכון — בדוק ונסה שוב." : "ההתחברות לא הצליחה. נסה שוב.",
          success: false,
        });
      }
    }

    return res.status(400).json({ error: "missing idNumber or otpCode" });
  } catch (e) {
    console.error("[browser-agent] login error:", e);
    alertDev("browser-agent", "שגיאה בהתחברות", { error: e.message }).catch(() => {});
    return res.status(500).json({ error: "שגיאה בהתחברות. נסו שוב." });
  }
}

async function tryFill(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await page.fill(sel, value);
        return true;
      }
    } catch {}
  }
  return false;
}

async function tryClick(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await page.click(sel);
        return true;
      }
    } catch {}
  }
  return false;
}
