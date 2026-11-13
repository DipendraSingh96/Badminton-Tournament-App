import type { Metadata } from "next";
import { AudienceBoard } from "./_components/audience-board";

export const metadata: Metadata = {
  title: "Audience board",
};

export default function BoardPage() {
  return <AudienceBoard />;
}
