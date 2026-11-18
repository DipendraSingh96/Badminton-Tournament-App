import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/product";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

/** The organiser's way in. Accounts are made by the club; there is no sign-up here. */
export default function LoginPage() {
  return (
    <main className="workspace-dots grid min-h-[100dvh] place-items-center px-4 py-16">
      <div className="flex w-full max-w-[360px] flex-col gap-6">
        <p className="font-display text-2xl leading-none font-bold uppercase">{PRODUCT_NAME}</p>
        <div className="flex flex-col gap-4 rounded-2xl bg-card p-6">
          <div className="flex flex-col gap-1">
            <h1 className="heading-card text-xl">Sign in</h1>
            <p className="text-sm text-muted-foreground">Your tournaments are kept in your account.</p>
          </div>
          <SignInForm />
        </div>
        <p className="text-sm text-muted-foreground">No account? Ask your club&apos;s organiser to make you one.</p>
      </div>
    </main>
  );
}
