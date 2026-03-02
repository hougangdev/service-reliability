"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

type SummaryResponse = {
  summary: string;
  incidents: Array<{
    serviceName: string;
    type: string;
    severity: string;
    details: string;
  }>;
  generatedAt: string;
};

export function IncidentSummary() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents/summary");
      if (res.status === 503) {
        const body = await res.json();
        setError(body.error ?? "AI summary unavailable — set ANTHROPIC_API_KEY.");
        return;
      }
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to generate summary.");
        return;
      }
      const body: SummaryResponse = await res.json();
      setData(body);
    } catch {
      setError("Network error — unable to reach the API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          AI Incident Summary
        </h2>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating…
            </span>
          ) : (
            "Generate Summary"
          )}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {data && !error && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-300 leading-relaxed" data-testid="summary-text">
            {data.summary}
          </p>
          {data.generatedAt && (
            <p className="text-[10px] text-zinc-600">
              Generated {new Date(data.generatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {!data && !error && !loading && (
        <p className="text-xs text-zinc-600">
          Click the button to analyze current service health with AI.
        </p>
      )}
    </div>
  );
}
