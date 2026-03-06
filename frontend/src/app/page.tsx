import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center text-white font-sans p-6 text-center">
      <div className="max-w-xl space-y-8">
        <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          OpenVision Ecosystem
        </h1>
        <p className="text-lg text-[#A1A1AA]">
          Next-generation academic assessment platform. Fully Decoupled & Verified.
        </p>

        <div className="bg-[#242424] border border-[#333] p-8 space-y-4">
          <h2 className="text-xl font-semibold border-b border-[#333] pb-4">Test Environment Access</h2>
          <div className="grid grid-cols-1 gap-4 text-left text-sm">
            <div className="p-4 bg-[#1A1A1A] border border-[#333] rounded">
              <p className="text-blue-400 font-bold mb-2 uppercase text-[10px]">Administrator</p>
              <p className="flex justify-between"><span>Email:</span> <code className="text-white">admin_e2e@vu.nl</code></p>
              <p className="flex justify-between"><span>Password:</span> <code className="text-white">adminpass123</code></p>
            </div>

            <div className="p-4 bg-[#1A1A1A] border border-[#333] rounded">
              <p className="text-emerald-400 font-bold mb-2 uppercase text-[10px]">Constructor</p>
              <p className="flex justify-between"><span>Email:</span> <code className="text-white">constructor_e2e@vu.nl</code></p>
              <p className="flex justify-between"><span>Password:</span> <code className="text-white">conpass123</code></p>
            </div>

            <div className="p-4 bg-[#1A1A1A] border border-[#333] rounded">
              <p className="text-amber-400 font-bold mb-2 uppercase text-[10px]">Student</p>
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

        <p className="text-xs text-[#555]">
          © 2026 OpenVision Advanced Agentic Coding Project.
        </p>
      </div>
    </div>
  );
}
