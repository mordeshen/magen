const { decideNextStep, PHASES } = require("./ai-driver");
const { loadUserProfile, AVAILABLE_FIELDS } = require("./pii-resolver");

const SHIKUM_URL = "https://myshikum.mod.gov.il";

function detectPhase(formFields, history) {
  const lastAction = history[history.length - 1];
  if (lastAction && (lastAction.type === "submit" || lastAction.type === "click-submit")) {
    return PHASES.VERIFICATION;
  }
  const hasFillableFields = formFields && formFields.some(
    (f) => f.type !== "hidden" && f.type !== "submit" && f.type !== "button"
  );
  if (hasFillableFields) return PHASES.FORM_FILL;
  return PHASES.NAVIGATION;
}

async function executeStep(session, task, userId, history) {
  if (!session.page || session.page.isClosed()) {
    throw new Error("הדפדפן נסגר. יש להתחיל סשן חדש.");
  }

  const fullState = await session.captureState();
  const phase = detectPhase(fullState.formFields, history);

  let inputPayload;
  if (phase === PHASES.NAVIGATION) {
    const screenshotB64 = fullState.screenshot.toString("base64");
    const anonState = session.anonymize(fullState);
    inputPayload = {
      screenshot: screenshotB64,
      dom: anonState.dom,
      url: fullState.url,
      title: fullState.title,
    };
  } else if (phase === PHASES.FORM_FILL) {
    const anonState = session.anonymize(fullState);
    inputPayload = {
      dom: anonState.dom,
      formFields: anonState.formFields,
      url: fullState.url,
      title: fullState.title,
    };
  } else {
    // VERIFICATION — use PII-scrubbed screenshot
    let safeScreenshot;
    try {
      safeScreenshot = await session.captureAnonymizedScreenshot();
    } catch {
      safeScreenshot = fullState.screenshot;
    }
    const anonState = session.anonymize(fullState);
    inputPayload = {
      screenshot: safeScreenshot.toString("base64"),
      dom: anonState.dom,
      url: fullState.url,
      title: fullState.title,
    };
  }

  const decision = await decideNextStep(phase, inputPayload, task, AVAILABLE_FIELDS, history);

  // Verification phase returns outcome, not actions
  if (phase === PHASES.VERIFICATION) {
    return {
      screenshot: fullState.screenshot.toString("base64"),
      message: decision.message,
      awaitConfirmation: false,
      done: decision.done,
      actions: [],
      phase,
      verification: {
        outcome: decision.outcome,
        referenceNumber: decision.referenceNumber,
        errors: decision.errors,
      },
    };
  }

  if (decision.done || (decision.awaitConfirmation && decision.actions.length === 0)) {
    return {
      screenshot: fullState.screenshot.toString("base64"),
      message: decision.message,
      awaitConfirmation: decision.awaitConfirmation,
      done: decision.done,
      actions: decision.actions,
      phase,
    };
  }

  // Resolve PII refs only in FORM_FILL phase
  let resolvedActions;
  if (phase === PHASES.FORM_FILL) {
    const resolver = await loadUserProfile(userId);
    resolvedActions = resolver.resolveActions(decision.actions);
  } else {
    resolvedActions = decision.actions.map((a) => ({
      type: a.type,
      selector: a.selector,
      value: a.literal_value,
      description: a.description,
    }));
  }

  let latestState = fullState;
  for (const action of resolvedActions) {
    try {
      latestState = await session.executeResolvedAction(action);
    } catch (e) {
      return {
        screenshot: latestState.screenshot.toString("base64"),
        message: `לא הצלחתי לבצע: ${action.description || action.type}. ${e.message}`,
        awaitConfirmation: true,
        done: false,
        actions: decision.actions,
        error: e.message,
        phase,
      };
    }
  }

  return {
    screenshot: latestState.screenshot.toString("base64"),
    message: decision.message,
    awaitConfirmation: decision.awaitConfirmation,
    done: decision.done,
    actions: decision.actions,
    phase,
  };
}

module.exports = { executeStep, detectPhase, PHASES, SHIKUM_URL };
