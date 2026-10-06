import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "RAT — Repo Analysis Tool",
  description:
    "Analyse git repositories: file, directory, repository, commit-set and author metrics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-100">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-sm font-bold text-white">
                R
              </span>
              <span>
                Repo Analysis Tool
                <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  git metrics
                </span>
              </span>
            </Link>
            <nav className="ml-auto flex items-center gap-4 text-sm text-slate-400">
              <Link href="/" className="hover:text-slate-100">
                Repositories
              </Link>
              <a
                href="https://git-scm.com/docs/git-log"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-100"
              >
                Docs
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
