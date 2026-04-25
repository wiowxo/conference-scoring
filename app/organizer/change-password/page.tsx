import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ForceChangePasswordForm from "./ForceChangePasswordForm";

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    redirect("/login");
  }
  if (!session.mustChangePassword) {
    redirect("/organizer/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Смена пароля</h1>
          <p className="text-sm text-gray-500 mt-2">
            Вы используете стандартный пароль. Установите новый пароль перед продолжением.
          </p>
        </div>
        <ForceChangePasswordForm />
      </div>
    </div>
  );
}
