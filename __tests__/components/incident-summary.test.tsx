// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncidentSummary } from "@/components/incident-summary";

describe("IncidentSummary", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the generate button", () => {
    render(<IncidentSummary />);
    expect(screen.getByText("Generate Summary")).toBeTruthy();
  });

  it("shows loading state while fetching", async () => {
    // Never resolves — simulates a pending request
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<IncidentSummary />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Generate Summary"));
    expect(screen.getByText("Generating…")).toBeTruthy();
  });

  it("displays summary text on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        summary: "All services are operating normally.",
        incidents: [],
        generatedAt: new Date().toISOString(),
      }),
    });

    render(<IncidentSummary />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Generate Summary"));

    await waitFor(() => {
      expect(screen.getByTestId("summary-text").textContent).toBe(
        "All services are operating normally."
      );
    });
  });

  it("handles 503 gracefully (no API key)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: "AI summary unavailable — ANTHROPIC_API_KEY is not configured.",
      }),
    });

    render(<IncidentSummary />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Generate Summary"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("ANTHROPIC_API_KEY");
    });
  });

  it("handles network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    render(<IncidentSummary />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Generate Summary"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Network error");
    });
  });
});
