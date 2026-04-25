import { prisma } from "@/lib/prisma";
import PublicResultsClient from "@/components/PublicResultsClient";

export default async function PublicResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ conferenceId?: string }>;
}) {
  const { conferenceId } = await searchParams;

  const conferences = await prisma.conference.findMany({
    where: { resultsPublished: true },
    orderBy: { date: "desc" },
    select: { id: true, name: true, date: true, status: true },
  });

  const selectedId = conferenceId ? parseInt(conferenceId) : conferences[0]?.id;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold text-gray-800">Результаты конференций</h1>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {conferences.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            Результаты ещё не опубликованы.
          </div>
        ) : (
          <PublicResultsClient
            conferences={conferences}
            selectedConferenceId={selectedId}
          />
        )}
      </main>
    </div>
  );
}
