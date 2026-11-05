import { redirect } from "next/navigation";

// Weight moved into the Health page (/food).
export default function HomePage() {
  redirect("/food");
}
