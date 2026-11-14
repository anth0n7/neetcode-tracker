import Link from "next/link";

export function MessagePage({
  title,
  children,
  actions,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="card px-6 py-14 text-center">
        <h1 className="font-medium">{title}</h1>
        {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actions}
          <Link href="/" className="btn">
            All problems
          </Link>
          <Link href="/today" className="btn">
            Today
          </Link>
        </div>
      </div>
    </main>
  );
}
