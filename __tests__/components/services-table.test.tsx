// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ServicesTable } from "@/components/services-table";
import type { ServiceSummary } from "@/lib/services/types";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
    },
  });
}

const recentChecks = [
  { ok: true, latencyMs: 100, checkedAt: "2024-01-01T00:05:00Z" },
  { ok: true, latencyMs: 120, checkedAt: "2024-01-01T00:04:00Z" },
  { ok: false, latencyMs: null, checkedAt: "2024-01-01T00:03:00Z" },
  { ok: true, latencyMs: 90, checkedAt: "2024-01-01T00:02:00Z" },
  { ok: true, latencyMs: 80, checkedAt: "2024-01-01T00:01:00Z" },
];

const mockService: ServiceSummary = {
  id: "uuid-1",
  name: "test-api",
  url: "http://mock/api/test",
  env: "demo",
  expectedVersion: "1.0.0",
  isActive: true,
  drift: false,
  latest: {
    ok: true,
    statusCode: 200,
    latencyMs: 42,
    observedVersion: "1.0.0",
    error: null,
    checkedAt: new Date().toISOString(),
  },
  recentChecks,
};

function Wrapper({
  children,
  client,
}: {
  children: React.ReactNode;
  client: QueryClient;
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ServicesTable", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders service rows from initial data", () => {
    const client = createQueryClient();
    render(
      <Wrapper client={client}>
        <ServicesTable initialData={[mockService]} />
      </Wrapper>
    );
    expect(screen.getByText("test-api")).toBeTruthy();
  });

  it("shows error banner when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const client = createQueryClient();
    render(
      <Wrapper client={client}>
        <ServicesTable initialData={[mockService]} />
      </Wrapper>
    );

    // Trigger a refetch to cause the error
    await client.refetchQueries({ queryKey: ["services"] }).catch(() => {});

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("dismisses error banner on click", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const client = createQueryClient();
    render(
      <Wrapper client={client}>
        <ServicesTable initialData={[mockService]} />
      </Wrapper>
    );

    await client.refetchQueries({ queryKey: ["services"] }).catch(() => {});

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Dismiss"));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders sparkline SVG with sufficient data", () => {
    const client = createQueryClient();
    const { container } = render(
      <Wrapper client={client}>
        <ServicesTable initialData={[mockService]} />
      </Wrapper>
    );
    // LatencySparkline renders an SVG polyline when ≥2 data points
    expect(container.querySelector("svg polyline")).toBeTruthy();
  });

  it("renders uptime percentage", () => {
    const client = createQueryClient();
    render(
      <Wrapper client={client}>
        <ServicesTable initialData={[mockService]} />
      </Wrapper>
    );
    // 4 out of 5 checks are ok → 80.0%
    expect(screen.getByTestId("uptime-pct").textContent).toBe("80.0%");
  });

  it("renders timeline squares", () => {
    const client = createQueryClient();
    const { container } = render(
      <Wrapper client={client}>
        <ServicesTable initialData={[mockService]} />
      </Wrapper>
    );
    // StatusTimeline renders colored squares (span elements with bg-emerald-500 or bg-red-500)
    const squares = container.querySelectorAll(".bg-emerald-500, .bg-red-500");
    expect(squares.length).toBe(5);
  });
});
