import { userCount } from "@/lib/auth";
import { RegisterForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return <RegisterForm first={await userCount() === 0} invite={invite ?? ""} />;
}
