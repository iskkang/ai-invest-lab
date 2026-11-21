import { redirect } from "next/navigation";

/** Public landing page. The private research console now lives at /lab. */
export default function Home() {
  redirect("/en");
}
