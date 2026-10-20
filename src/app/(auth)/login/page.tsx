import { redirect } from "next/navigation";
import { userCount } from "@/lib/auth";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await userCount() === 0) redirect("/register");
  return <LoginForm />;
}
