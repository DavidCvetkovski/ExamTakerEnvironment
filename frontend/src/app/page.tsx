import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-shell-bg flex flex-col items-center justify-center p-6 text-center font-sans text-white">
      <div className="max-w-xl space-y-8">
        <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          OpenVision Ecosystem
        </h1>
        <p className="text-lg text-shell-muted">
          Next-generation academic assessment platform. Fully Decoupled & Verified.
        </p>

        <div className="bg-shell-surface border border-shell-border p-8 space-y-4">
          <h2 className="border-b border-shell-border pb-4 text-xl font-semibold">Test Environment Access</h2>
          <div className="grid grid-cols-1 gap-4 text-left text-sm">
            <div className="rounded border border-shell-border bg-shell-bg p-4">
              <p className="mb-2 text-eyebrow-sm font-bold uppercase text-blue-400">Administrator</p>
              <p className="flex justify-between"><span>Email:</span> <code className="text-white">admin_e2e@vu.nl</code></p>
              <p className="flex justify-between"><span>Password:</span> <code className="text-white">adminpass123</code></p>
            </div>

            <div className="rounded border border-shell-border bg-shell-bg p-4">
              <p className="mb-2 text-eyebrow-sm font-bold uppercase text-emerald-400">Constructor</p>
              <p className="flex justify-between"><span>Email:</span> <code className="text-white">constructor_e2e@vu.nl</code></p>
              <p className="flex justify-between"><span>Password:</span> <code className="text-white">conpass123</code></p>
            </div>

            <div className="rounded border border-shell-border bg-shell-bg p-4">
              <p className="mb-2 text-eyebrow-sm font-bold uppercase text-amber-400">Student</p>
              <p className="flex justify-between"><span>Email:</span> <code className="text-white">student_e2e@vu.nl</code></p>
              <p className="flex justify-between"><span>Password:</span> <code className="text-white">studentpass123</code></p>
            </div>
          </div>

          <Link
            href="/login"
            className="block w-full bg-blue-600 hover:bg-blue-700 p-4 text-white font-bold transition-all transform hover:scale-[1.02]"
          >
            Go to SSO Login
          </Link>
        </div>

        <p className="text-xs text-shell-muted-dim">
          © 2026 OpenVision Advanced Agentic Coding Project.
        </p>
      </div>
    </div>
  );
}
