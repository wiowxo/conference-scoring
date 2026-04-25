import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const criterionId = parseInt(id);
  const zones = await prisma.qualityZone.findMany({
    where: { criterionId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(zones);
}

export async function POST(
  req: NextRequest,
  { params }: Params
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const criterionId = parseInt(id);

  // Verify criterion exists and get conferenceId for socket emit
  const criterion = await prisma.criterion.findUnique({
    where: { id: criterionId },
    select: { id: true, conferenceId: true },
  });
  if (!criterion) {
    return NextResponse.json({ error: "Критерий не найден" }, { status: 404 });
  }

  const body = await req.json();
  // body.zones: array of { label, minValue, maxValue, color, order }
  // body.useQualityZones: boolean
  const { zones, useQualityZones } = body;

  if (!Array.isArray(zones)) {
    return NextResponse.json({ error: "zones must be an array" }, { status: 400 });
  }

  // Validate each zone
  for (const z of zones) {
    if (!z.label || typeof z.label !== "string") {
      return NextResponse.json({ error: "Каждая зона должна иметь название" }, { status: 400 });
    }
    if (typeof z.minValue !== "number" || typeof z.maxValue !== "number") {
      return NextResponse.json({ error: "minValue и maxValue должны быть числами" }, { status: 400 });
    }
    if (z.minValue >= z.maxValue) {
      return NextResponse.json({ error: "minValue должен быть меньше maxValue" }, { status: 400 });
    }
  }

  // Replace all zones in a transaction
  const [updatedCriterion, newZones] = await prisma.$transaction(async (tx) => {
    await tx.qualityZone.deleteMany({ where: { criterionId } });
    const created = await Promise.all(
      zones.map((z: { label: string; minValue: number; maxValue: number; color: string; order?: number }, i: number) =>
        tx.qualityZone.create({
          data: {
            criterionId,
            label: String(z.label).slice(0, 100),
            minValue: z.minValue,
            maxValue: z.maxValue,
            color: String(z.color || "#6b7280").slice(0, 20),
            order: typeof z.order === "number" ? z.order : i,
          },
        })
      )
    );
    const updated = await tx.criterion.update({
      where: { id: criterionId },
      data: { useQualityZones: typeof useQualityZones === "boolean" ? useQualityZones : true },
    });
    return [updated, created];
  });

  emitConferenceEvent(criterion.conferenceId, "criterion:zones:updated", {
    criterionId,
    useQualityZones: updatedCriterion.useQualityZones,
    zones: newZones,
  });

  return NextResponse.json({ criterion: updatedCriterion, zones: newZones });
}
