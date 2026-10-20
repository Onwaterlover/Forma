import { redirect } from "next/navigation";
import { userCount } from "@/lib/auth";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (userCount() === 0) redirect("/register");
  return <LoginForm />;
}
