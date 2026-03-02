import { notFound } from "next/navigation";
import { queryServiceById, queryServiceHistory } from "@/lib/api/queries";
import { ServiceDetailView } from "@/components/service-detail";
import { Header } from "@/components/header";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ServiceDetailPage({ params }: Props) {
  const { id } = await params;

  const [service, historyResult] = await Promise.all([
    queryServiceById(id),
    queryServiceHistory(id, 50),
  ]);

  if (!service) notFound();

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="mx-auto max-w-screen-xl px-6 py-8">
        <ServiceDetailView
          serviceId={id}
          initialService={service}
          initialHistory={{ serviceId: id, ...historyResult }}
        />
      </main>
    </div>
  );
}
