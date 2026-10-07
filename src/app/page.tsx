import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Badminton Tournament App
      </h1>
      <p className="text-muted-foreground">
        Plan, price and run a badminton tournament.
      </p>
      <Link
        href="/plan"
        className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
      >
        Plan a tournament
      </Link>
    </main>
  );
}
