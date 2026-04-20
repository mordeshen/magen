const { chromium } = require("playwright");

class BrowserAgentSession {
  constructor(id, userId) {
    this.id = id;
    this.userId = userId;
    this.browser = null;
    this.page = null;
    this.status = "starting";
    this.createdAt = new Date();
    this.lastActivity = new Date();
  }

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 800 });
    this.status = "active";
  }

  async navigateTo(url) {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    this.lastActivity = new Date();
    return this.captureState();
  }

  async captureState() {
    const screenshot = await this.page.screenshot({ type: "png" });
    const dom = await this.extractSimplifiedDOM();
    const formFields = await this.extractFormFields();
    return {
      url: this.page.url(),
      title: await this.page.title(),
      screenshot,
      dom,
      formFields,
    };
  }

  anonymize(state) {
    return {
      url: state.url,
      title: state.title,
      dom: this.stripValuesFromDOM(state.dom),
      formFields: state.formFields.map((f) => ({
        selector: f.selector,
        type: f.type,
        label: f.label,
        required: f.required,
        filled: !!f.value,
        options: f.options,
      })),
    };
  }

  stripValuesFromDOM(dom) {
    return dom.replace(/value="[^"]*"/g, 'value=""');
  }

  async executeResolvedAction(action) {
    try {
      switch (action.type) {
        case "fill":
          await this.page.fill(action.selector, action.value);
          break;
        case "click":
          await this.page.click(action.selector, { timeout: 10000 });
          break;
        case "select":
          await this.page.selectOption(action.selector, action.value);
          break;
        case "navigate":
          await this.page.goto(action.value, { waitUntil: "domcontentloaded", timeout: 30000 });
          break;
        case "upload":
          await this.page.setInputFiles(action.selector, action.value);
          break;
        case "submit":
          await this.page.click(action.selector, { timeout: 10000 });
          await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
          break;
        case "wait":
          await this.page.waitForTimeout(parseInt(action.value) || 1000);
          break;
      }
    } catch (e) {
      console.warn(`[browser-agent] action ${action.type} failed:`, e.message);
      throw e;
    }
    await this.page.waitForTimeout(500);
    this.lastActivity = new Date();
    return this.captureState();
  }

  async extractSimplifiedDOM() {
    return this.page.evaluate(() => {
      const relevant = document.querySelectorAll(
        "form, input, select, textarea, button, a[href], h1, h2, h3, label, [role='button'], table, th, td"
      );
      return Array.from(relevant)
        .map((el) => {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : "";
          const name = el.getAttribute("name") || "";
          const type = el.getAttribute("type") || "";
          const text = (el.textContent || "").trim().substring(0, 100);
          const value = el.value || "";
          const href = el.getAttribute("href") || "";
          const placeholder = el.getAttribute("placeholder") || "";
          const required = el.hasAttribute("required") ? " required" : "";
          const disabled = el.hasAttribute("disabled") ? " disabled" : "";
          return `<${tag}${id} name="${name}" type="${type}" value="${value}" href="${href}" placeholder="${placeholder}"${required}${disabled}>${text}</${tag}>`;
        })
        .join("\n");
    });
  }

  async extractFormFields() {
    return this.page.evaluate(() => {
      const fields = [];
      document.querySelectorAll("input, select, textarea").forEach((el) => {
        const label = document.querySelector(`label[for="${el.id}"]`);
        let options;
        if (el.tagName === "SELECT") {
          options = Array.from(el.options).map((o) => o.textContent.trim());
        }
        fields.push({
          selector: el.id ? `#${el.id}` : `[name="${el.name}"]`,
          type: el.type || el.tagName.toLowerCase(),
          label: (label && label.textContent.trim()) || el.placeholder || el.name || "",
          value: el.value || "",
          required: el.required || false,
          options,
        });
      });
      return fields;
    });
  }

  async close() {
    this.status = "closed";
    try {
      await this.browser?.close();
    } catch {}
  }

  isExpired() {
    return Date.now() - this.lastActivity.getTime() > 10 * 60 * 1000;
  }
}

// Session manager — limits concurrent sessions
const sessions = new Map();
const MAX_SESSIONS = 3;

function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s && s.isExpired()) {
    s.close();
    sessions.delete(sessionId);
    return null;
  }
  return s || null;
}

async function createSession(userId) {
  // Clean expired sessions
  for (const [id, s] of sessions) {
    if (s.isExpired()) {
      await s.close();
      sessions.delete(id);
    }
  }
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error("too_many_sessions");
  }
  const id = `bsess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = new BrowserAgentSession(id, userId);
  await session.init();
  sessions.set(id, session);
  return session;
}

function closeSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s) {
    s.close();
    sessions.delete(sessionId);
  }
}

module.exports = { BrowserAgentSession, getSession, createSession, closeSession };
