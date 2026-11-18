import { redirect } from "next/navigation";

// Weight moved into the Health page (/health).
export default function HomePage() {
  redirect("/health");
}
