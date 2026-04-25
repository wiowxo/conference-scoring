import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import JuryNav from "@/components/JuryNav";
import ConnectionStatus from "@/components/ConnectionStatus";

export default async function JuryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== "jury") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <JuryNav name={session.name} />
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      <ConnectionStatus />
    </div>
  );
}
