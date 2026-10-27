import React, { useEffect, useState } from "react";
import { Award, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Progress } from "../components/ui/Progress";
import { ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { formatDate } from "../lib/format";

export default function Achievements() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = () => {
    setState({ loading: true, error: null, data: null });
    api("/achievements")
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  };

  useEffect(() => {
    load();
  }, []);

  if (state.error) return <ErrorState error={state.error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        eyebrow="Milestones"
        title="Achievements"
        subtitle="Rule-based — each one is evaluated from your stored records, never granted arbitrarily."
      />

      {state.loading || !state.data ? (
        <SkeletonRows rows={4} />
      ) : (
        <>
          <Card>
            <div className="row" style={{ gap: 14 }}>
              <span className="stat-icon" style={{ width: 40, height: 40 }}>
                <Award size={20} />
              </span>
              <div className="grow">
                <div className="row-between">
                  <strong>
                    {state.data.unlocked} of {state.data.total} unlocked
                  </strong>
                  <span className="muted tiny">
                    {Math.round((state.data.unlocked / Math.max(1, state.data.total)) * 100)}%
                  </span>
                </div>
                <Progress
                  value={Math.round((state.data.unlocked / Math.max(1, state.data.total)) * 100)}
                  tone="success"
                />
              </div>
            </div>
          </Card>

          <div className="grid grid-3 section-gap">
            {state.data.items.map((item) => (
              <Card key={item.key} className={`achievement${item.earned ? " earned" : ""}`}>
                <span className="achievement-icon" aria-hidden>
                  {item.icon}
                </span>
                <strong className="small">{item.title}</strong>
                <span className="muted tiny">{item.description}</span>
                {item.unlockedAt ? (
                  <span className="achievement-meta">Unlocked {formatDate(item.unlockedAt)}</span>
                ) : (
                  <span className="achievement-meta locked">
                    <Sparkles size={11} /> Still locked
                  </span>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
