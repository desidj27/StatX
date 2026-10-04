import { redirect } from "next/navigation";
import { getSession } from "@/lib/session.js";

export async function GET() {
  const session = await getSession();
  session.destroy();
  redirect("/");
}
