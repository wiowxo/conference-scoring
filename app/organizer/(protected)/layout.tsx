import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import OrganizerNav from "@/components/OrganizerNav";
import ConnectionStatus from "@/components/ConnectionStatus";

export default async function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    redirect("/login");
  }
  if (session.mustChangePassword) {
    redirect("/organizer/change-password");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <OrganizerNav name={session.name} />
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      <ConnectionStatus />
    </div>
  );
}
