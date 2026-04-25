import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ConferenceManager from "@/components/ConferenceManager";

function statusLabel(status: string) {
  return status === "ACTIVE" ? "Активна" : "Завершена";
}

export default async function ConferencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conference = await prisma.conference.findUnique({
    where: { id: parseInt(id) },
    include: {
      halls: {
        include: { votingStatus: true },
        orderBy: { createdAt: "asc" },
      },
      sections: {
        include: {
          presenters: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
      criteria: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: { qualityZones: { orderBy: { order: "asc" } } },
      },
      juryMembers: {
        include: {
          sectionAssignments: { select: { sectionId: true } },
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!conference) notFound();

  return (
    <div>
      <div className="flex items-start gap-3 mb-6 min-w-0">
        <h1 className="text-2xl font-bold text-gray-800 line-clamp-2 min-w-0 break-all [overflow-wrap:anywhere] overflow-hidden">
          {conference.name}
        </h1>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-1 ${
            conference.status === "ACTIVE"
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {statusLabel(conference.status)}
        </span>
      </div>
      <ConferenceManager conference={conference} />
    </div>
  );
}
