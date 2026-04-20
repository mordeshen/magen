import { useState, useEffect } from "react";
import { useUser } from "../lib/UserContext";

const LOCAL_TASKS_KEY = "magen_task_queue";

const STATUS_MAP = {
  pending: { label: "ממתין", color: "var(--copper-400)", bg: "rgba(244,162,78,.12)" },
  in_progress: { label: "בתהליך", color: "var(--status-info)", bg: "rgba(96,165,250,.12)" },
  completed: { label: "הושלם", color: "var(--status-success)", bg: "rgba(78,203,138,.12)" },
};

function loadLocalTasks() {
  try {
    const raw = localStorage.getItem(LOCAL_TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalTasks(tasks) {
  try {
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
  } catch {}
}

export default function TaskQueue({ tasks, onUpdateTasks, collapsed, onToggleCollapse }) {
  const { user } = useUser();

  function updateStatus(taskId, newStatus) {
    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, status: newStatus } : t
    );
    onUpdateTasks(updated);
  }

  function removeTask(taskId) {
    const updated = tasks.filter(t => t.id !== taskId);
    onUpdateTasks(updated);
  }

  function openInAgent(task) {
    const evt = new CustomEvent("open-browser-agent", {
      detail: { task: task.agentTask || task.title, taskId: task.id },
    });
    window.dispatchEvent(evt);
    // Mark as in_progress
    if (task.status === "pending") {
      updateStatus(task.id, "in_progress");
    }
  }

  const pendingTasks = tasks.filter(t => t.status !== "completed");
  const completedTasks = tasks.filter(t => t.status === "completed");

  if (tasks.length === 0) return null;

  return (
    <div className={`tq-panel ${collapsed ? "tq-collapsed" : ""}`}>
      <button className="tq-toggle" onClick={onToggleCollapse} title={collapsed ? "הצג משימות" : "הסתר משימות"}>
        <span className="tq-toggle-icon">{collapsed ? "◀" : "▶"}</span>
        {collapsed && <span className="tq-badge-count">{pendingTasks.length}</span>}
      </button>

      {!collapsed && (
        <div className="tq-content">
          <div className="tq-header">
            <h3 className="tq-title">משימות לביצוע</h3>
            <span className="tq-count">{pendingTasks.length} פתוחות</span>
          </div>

          {pendingTasks.length === 0 && (
            <div className="tq-empty">אין משימות פתוחות</div>
          )}

          <div className="tq-list">
            {pendingTasks.map(task => {
              const s = STATUS_MAP[task.status] || STATUS_MAP.pending;
              return (
                <div key={task.id} className="tq-card">
                  <div className="tq-card-top">
                    <span className="tq-status-badge" style={{ color: s.color, background: s.bg }}>
                      {s.label}
                    </span>
                    <button className="tq-remove" onClick={() => removeTask(task.id)} title="הסר משימה">&times;</button>
                  </div>
                  <div className="tq-card-title">{task.title}</div>
                  {task.description && <div className="tq-card-desc">{task.description}</div>}
                  <div className="tq-card-actions">
                    {task.agentTask && (
                      <button className="tq-agent-btn" onClick={() => openInAgent(task)}>
                        בצע עם סוכן
                      </button>
                    )}
                    <div className="tq-status-btns">
                      {task.status === "pending" && (
                        <button className="tq-status-btn" onClick={() => updateStatus(task.id, "in_progress")}>התחלתי</button>
                      )}
                      <button className="tq-status-btn tq-done-btn" onClick={() => updateStatus(task.id, "completed")}>בוצע</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {completedTasks.length > 0 && (
            <details className="tq-completed-section">
              <summary className="tq-completed-toggle">הושלמו ({completedTasks.length})</summary>
              <div className="tq-list">
                {completedTasks.map(task => (
                  <div key={task.id} className="tq-card tq-card-done">
                    <div className="tq-card-top">
                      <span className="tq-status-badge" style={{ color: STATUS_MAP.completed.color, background: STATUS_MAP.completed.bg }}>
                        {STATUS_MAP.completed.label}
                      </span>
                      <button className="tq-remove" onClick={() => removeTask(task.id)} title="הסר">&times;</button>
                    </div>
                    <div className="tq-card-title">{task.title}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <style jsx>{`
        .tq-panel {
          position: relative;
          background: var(--stone-900);
          border-inline-start: 1px solid var(--stone-700);
          width: 280px;
          min-width: 280px;
          display: flex;
          flex-direction: column;
          transition: width var(--duration-fast, 0.15s) var(--ease-out-quad, ease-out),
                      min-width var(--duration-fast, 0.15s) var(--ease-out-quad, ease-out);
          overflow: hidden;
        }
        .tq-panel.tq-collapsed {
          width: 40px;
          min-width: 40px;
        }
        .tq-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: var(--stone-400);
          cursor: pointer;
          padding: 10px 8px;
          font-size: 12px;
          border-bottom: 1px solid var(--stone-800);
          font-family: 'Heebo', sans-serif;
          direction: rtl;
        }
        .tq-toggle:hover { color: var(--accent-primary); }
        .tq-toggle-icon { font-size: 10px; }
        .tq-badge-count {
          background: var(--copper-500);
          color: var(--stone-950);
          font-size: 11px;
          font-weight: 700;
          border-radius: 10px;
          padding: 1px 7px;
          min-width: 18px;
          text-align: center;
        }
        .tq-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }
        .tq-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .tq-title {
          font-family: 'Heebo', sans-serif;
          font-size: 15px;
          font-weight: 700;
          color: var(--stone-200);
          margin: 0;
        }
        .tq-count {
          font-family: 'Heebo', sans-serif;
          font-size: 12px;
          color: var(--stone-400);
        }
        .tq-empty {
          font-family: 'Heebo', sans-serif;
          font-size: 13px;
          color: var(--stone-600);
          text-align: center;
          padding: 24px 0;
        }
        .tq-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tq-card {
          background: var(--stone-800);
          border: 1px solid var(--stone-700);
          border-radius: 6px;
          padding: 10px;
          direction: rtl;
        }
        .tq-card-done { opacity: 0.6; }
        .tq-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .tq-status-badge {
          font-family: 'Heebo', sans-serif;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .tq-remove {
          background: none;
          border: none;
          color: var(--stone-600);
          cursor: pointer;
          font-size: 16px;
          padding: 0 4px;
          line-height: 1;
        }
        .tq-remove:hover { color: var(--status-urgent); }
        .tq-card-title {
          font-family: 'Heebo', sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--stone-200);
          line-height: 1.5;
          margin-bottom: 4px;
        }
        .tq-card-desc {
          font-family: 'Heebo', sans-serif;
          font-size: 12px;
          color: var(--stone-400);
          line-height: 1.5;
          margin-bottom: 8px;
        }
        .tq-card-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
        }
        .tq-agent-btn {
          font-family: 'Heebo', sans-serif;
          font-size: 11px;
          font-weight: 600;
          color: var(--stone-950);
          background: var(--copper-500);
          border: none;
          border-radius: 4px;
          padding: 4px 10px;
          cursor: pointer;
          transition: background var(--duration-fast, 0.15s);
        }
        .tq-agent-btn:hover { background: var(--copper-600); }
        .tq-status-btns {
          display: flex;
          gap: 4px;
        }
        .tq-status-btn {
          font-family: 'Heebo', sans-serif;
          font-size: 11px;
          color: var(--stone-300);
          background: var(--stone-700);
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          cursor: pointer;
        }
        .tq-status-btn:hover { background: var(--stone-600); }
        .tq-done-btn:hover { background: var(--status-success); color: var(--stone-950); }
        .tq-completed-section {
          margin-top: 12px;
          border-top: 1px solid var(--stone-800);
          padding-top: 8px;
        }
        .tq-completed-toggle {
          font-family: 'Heebo', sans-serif;
          font-size: 12px;
          color: var(--stone-400);
          cursor: pointer;
          direction: rtl;
          padding: 4px 0;
        }
        .tq-completed-toggle:hover { color: var(--stone-300); }

        @media (max-width: 768px) {
          .tq-panel {
            position: fixed;
            top: 0;
            inset-inline-start: 0;
            height: 100dvh;
            z-index: 100;
            box-shadow: 4px 0 16px rgba(0,0,0,.4);
          }
          .tq-panel.tq-collapsed {
            width: 36px;
            min-width: 36px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tq-panel { transition: none; }
        }
      `}</style>
    </div>
  );
}
