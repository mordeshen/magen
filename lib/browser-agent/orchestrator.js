const { decideNextStep } = require("./ai-driver");
const { loadUserProfile, AVAILABLE_FIELDS } = require("./pii-resolver");

const SHIKUM_URL = "https://myshikum.mod.gov.il";

async function executeStep(session, task, userId, history) {
  // 1. Capture current page state (full, with PII)
  const fullState = await session.captureState();

  // 2. Anonymize — strip all PII before sending to Claude
  const anonState = session.anonymize(fullState);

  // 3. Claude decides what to do (sees NO PII)
  const decision = await decideNextStep(
    anonState,
    task,
    AVAILABLE_FIELDS,
    history
  );

  // 4. If done or needs confirmation before actions, return screenshot + message
  if (decision.done || (decision.awaitConfirmation && decision.actions.length === 0)) {
    return {
      screenshot: fullState.screenshot.toString("base64"),
      message: decision.message,
      awaitConfirmation: decision.awaitConfirmation,
      done: decision.done,
      actions: decision.actions,
    };
  }

  // 5. Resolve value_refs to real values (local, no cloud)
  const resolver = await loadUserProfile(userId);
  const resolvedActions = resolver.resolveActions(decision.actions);

  // 6. Execute resolved actions in Playwright
  let latestState = fullState;
  for (const action of resolvedActions) {
    try {
      latestState = await session.executeResolvedAction(action);
    } catch (e) {
      return {
        screenshot: latestState.screenshot.toString("base64"),
        message: `לא הצלחתי לבצע: ${action.description}. ${e.message}`,
        awaitConfirmation: true,
        done: false,
        actions: decision.actions,
        error: e.message,
      };
    }
  }

  // 7. Return screenshot (to frontend only) + message
  return {
    screenshot: latestState.screenshot.toString("base64"),
    message: decision.message,
    awaitConfirmation: decision.awaitConfirmation,
    done: decision.done,
    actions: decision.actions,
  };
}

module.exports = { executeStep, SHIKUM_URL };
