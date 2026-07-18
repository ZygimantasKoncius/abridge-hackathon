import { redirect } from "next/navigation";

export default function Home() {
  // Provider dashboard is the demo surface; /journal (patient voice) lands later.
  redirect("/provider");
}
