import type { Metadata } from "next";
import { FollowBoard } from "./_components/follow-board";

export const metadata: Metadata = {
  title: "Follow the tournament",
  // A link passed between players, not a page to be found.
  robots: { index: false, follow: false },
};

/** The players' link: who is on court, the scores, what is next, and the results at the end. Read-only, no sign-in. */
export default function FollowPage() {
  return <FollowBoard />;
}
