import { redirect } from "next/navigation";

/** Preserve old links while making the original dashboard the public homepage. */
export default function Home() {
  redirect("/ko");
}
