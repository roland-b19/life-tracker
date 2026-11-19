import { redirect } from "next/navigation";

// The app starts on Tasks (/todos), the page the owner opens every day.
export default function HomePage() {
  redirect("/todos");
}
