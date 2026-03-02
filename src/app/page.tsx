import { queryAllServices } from "@/lib/api/queries";
import { ServicesTable } from "@/components/services-table";
import { Header } from "@/components/header";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Initial data via SSR — React Query takes over for auto-refresh
  const initialData = await queryAllServices();

  const upCount = initialData.filter((s) => s.latest?.ok).length;
  const downCount = initialData.filter((s) => s.latest?.ok === false).length;
  const driftCount = initialData.filter((s) => s.drift === true).length;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="mx-auto max-w-screen-xl px-6 py-8">
        {/* summary stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Services" value={initialData.length} />
          <StatCard label="Up" value={upCount} colour="text-emerald-400" />
          <StatCard label="Down" value={downCount} colour="text-red-400" />
          <StatCard label="Version Drift" value={driftCount} colour="text-yellow-400" />
        </div>

        <ServicesTable initialData={initialData} />
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  colour = "text-zinc-100",
}: {
  label: string;
  value: number;
  colour?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
      <p className="text-xs text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>
        {value}
      </p>
    </div>
  );
}
