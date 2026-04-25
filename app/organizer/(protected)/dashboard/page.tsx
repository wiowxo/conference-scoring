import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ConferenceList from "@/components/ConferenceList";

export default async function OrganizerDashboard() {
  const conferences = await prisma.conference.findMany({
    include: { _count: { select: { halls: true, criteria: true } } },
    orderBy: { date: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Конференции</h1>
        <Link
          href="/organizer/conferences/new"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Новая конференция
        </Link>
      </div>

      <ConferenceList initialConferences={conferences} />
    </div>
  );
}
