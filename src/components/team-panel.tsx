"use client";

import { useEffect, useState } from "react";
import { presenceLabel, presenceState, type PresenceState } from "@/server/presence";

export type TeamMember = { id: string; name: string; roleName: string; lastActiveAt: string | null };

const DOT: Record<PresenceState, string> = {
  online: "bg-success",
  recent: "bg-warning",
  away: "bg-sub",
  never: "bg-bd",
};

/** Who is around, in the sidebar. Refreshes itself once a minute; the refresh isn't counted as activity. */
export function TeamPanel({ initial, selfId }: { initial: TeamMember[]; selfId: string }) {
  const [members, setMembers] = useState(initial);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const res = await fetch("/api/admin/team", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const data = await res.json();
        setMembers(data.members);
        setNow(new Date(data.now));
      } catch {
        // Presence is a nicety: a failed refresh just leaves the last view in place.
      }
    }
    const timer = setInterval(refresh, 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="mb-3 border-b border-bd px-2 pb-3">
      <div className="mb-1.5 text-[11px] font-medium tracking-wide text-sub uppercase">Team</div>
      <ul className="flex flex-col gap-1.5">
        {members.map((m) => {
          const last = m.lastActiveAt ? new Date(m.lastActiveAt) : null;
          // The viewer is, by definition, here right now.
          const isSelf = m.id === selfId;
          const state = isSelf ? "online" : presenceState(last, now);
          return (
            <li key={m.id} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${DOT[state]}`} aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-ink">
                  {m.name}
                  {isSelf && <span className="text-sub"> (you)</span>}
                </span>
                <span className="block truncate text-sub">{isSelf ? "Active now" : presenceLabel(last, now)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
