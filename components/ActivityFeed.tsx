"use client";

import { KindGlyph, OUTCOME_LABEL } from "./ui";
import { displayText, fmtDate, isToday } from "@/lib/text";
import type { ActivityItem } from "@/lib/types";

const VERB: Record<ActivityItem["kind"], string> = {
  visit: "Visit recorded",
  outcome: "Outcome recorded",
  case: "Clinic case learned",
  allergy: "Allergy noted",
  note: "Memory added",
};

function when(at: string | null): string {
  if (!at) return "";
  return isToday(at) ? "Today" : fmtDate(at);
}

export function ActivityFeed({ items, emptyLabel = "No recent activity yet." }: { items: ActivityItem[]; emptyLabel?: string }) {
  if (items.length === 0) return <p className="empty">{emptyLabel}</p>;
  return (
    <ul className="activity-list">
      {items.map((a) => (
        <li key={a.id} className="activity-item">
          <span className={`activity-icon src-${a.source}`} aria-hidden>
            <KindGlyph kind={a.kind} />
          </span>
          <span className="activity-body">
            <p>
              <span className="lead">{VERB[a.kind]}</span>
              {a.patientName ? ` · ${a.patientName}` : a.source === "clinic" ? " · clinic memory" : ""}
              {a.outcome ? ` — ${OUTCOME_LABEL[a.outcome]}` : ""}
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 12 }}>{displayText(a.text)}</p>
          </span>
          <span className="activity-when">{when(a.at)}</span>
        </li>
      ))}
    </ul>
  );
}
