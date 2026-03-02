import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { queryAllServices, queryRecentChecksForServices } from "@/lib/services/queries";
import { detectIncidents, type ServiceWithChecks } from "@/lib/monitoring/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI summary unavailable — ANTHROPIC_API_KEY is not configured." },
      { status: 503 }
    );
  }

  try {
    // Reuse existing query functions to get services + recent checks
    const services = await queryAllServices();
    const activeIds = services.filter((s) => s.isActive).map((s) => s.id);
    const recentMap = await queryRecentChecksForServices(activeIds, 20);

    const enriched: ServiceWithChecks[] = services.map((svc) => ({
      ...svc,
      recentChecks: recentMap.get(svc.id) ?? [],
    }));

    const incidents = detectIncidents(enriched);

    // No incidents → skip LLM call entirely (saves cost)
    if (incidents.length === 0) {
      return NextResponse.json({
        summary: "All services are operating normally.",
        incidents: [],
        generatedAt: new Date().toISOString(),
      });
    }

    // Call Claude Haiku for fast, cheap summarization
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:
        "You are a concise incident reporter for a service monitoring system. " +
        "Summarize the following detected incidents in 2-4 sentences. Focus on impact " +
        "and actionable next steps. Be specific about service names and metrics.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(incidents),
        },
      ],
    });

    const summary =
      message.content[0].type === "text"
        ? message.content[0].text
        : "Unable to generate summary.";

    return NextResponse.json({
      summary,
      incidents,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate incident summary" },
      { status: 502 }
    );
  }
}
