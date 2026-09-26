import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { getPersonActivity } from "@/server/person-activity";

type Activity = Awaited<ReturnType<typeof getPersonActivity>>;

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-sm font-semibold">
        {title}
        {count !== undefined && <span className="ml-2 font-mono text-xs text-sub">{count}</span>}
      </h2>
      {children}
    </Card>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-sub">{text}</p>;
const date = (d: Date) => d.toLocaleDateString();

/** Read-only sections that complete the User 360 view (module 7.3). Rendered on the server. */
export default function PersonActivity({ activity }: { activity: Activity }) {
  const { competitions, offers, countryReviews, supportThreads, audit } = activity;
  return (
    <div className="mt-5 flex flex-col gap-5">
      <Section title="Competitions" count={competitions.length}>
        {competitions.length === 0 ? (
          <Empty text="Has not entered any competition." />
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {competitions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <Link className="text-acc underline" href={`/admin/competitions/${c.competition.id}`}>
                  {c.competition.name}
                </Link>
                <span className="flex items-center gap-2 text-xs text-sub">
                  equity {c.equity.toString()} · {c.tradesCount} trades · entered {date(c.enteredAt)}
                  <Badge tone={c.status === "active" ? "success" : "danger"}>{c.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Offers" count={offers.length}>
        {offers.length === 0 ? (
          <Empty text="No offers issued." />
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {offers.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <span>
                  {o.campaign.name} <span className="font-mono text-xs text-sub">{o.campaign.code}</span> · {o.challengeType.name}
                </span>
                <span className="flex items-center gap-2 text-xs text-sub">
                  {o.normalFee.toString()} → {o.offerFee.toString()} {o.challengeType.currency} · issued {date(o.issuedAt)}
                  {o.redeemedAt && ` · redeemed ${date(o.redeemedAt)}`}
                  <Badge tone={o.status === "redeemed" ? "success" : o.status === "sent" ? "accent" : "neutral"}>{o.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Country reviews" count={countryReviews.length}>
        {countryReviews.length === 0 ? (
          <Empty text="No country reviews." />
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {countryReviews.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span>
                  {r.countryCode} · {r.stage}
                  {r.resolutionNote && <span className="text-xs text-sub"> — {r.resolutionNote}</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-sub">
                  {date(r.createdAt)}
                  <Badge tone={r.status === "open" ? "warning" : "neutral"}>{r.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {supportThreads && (
        <Section title="Support conversations" count={supportThreads.length}>
          {supportThreads.length === 0 ? (
            <Empty text="No support conversations." />
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {supportThreads.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <Link className="text-acc underline" href={`/admin/support/${t.id}`}>
                    {t.subject}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-sub">
                    {t.category} · {date(t.lastMessageAt)}
                    <Badge tone={t.status === "open" ? "warning" : t.status === "resolved" ? "success" : "accent"}>
                      {t.status.replace("_", " ")}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {audit && (
        <Section title="Audit trail" count={audit.length}>
          {audit.length === 0 ? (
            <Empty text="No recorded activity." />
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {audit.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-bd pb-1 last:border-b-0">
                  <span>
                    <span className="font-mono">{a.action}</span>
                    <span className="text-sub">
                      {" "}
                      · {a.actorName ?? a.actorType}
                      {a.reason && ` · ${a.reason}`}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-sub">{a.timestamp.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-sub">Latest 100 entries about this person, their accounts, and their own actions.</p>
        </Section>
      )}
    </div>
  );
}
