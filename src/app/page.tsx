/** Phase 8A: rendered per request so `src/proxy.ts`'s CSP nonce can be stamped onto Next's inline hydration scripts — a statically generated page has no request to derive one from. */
export const dynamic = "force-dynamic";

export default function HealthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-8 text-black">
      <div className="max-w-xl text-center">
        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
          Temporary Phase 0 placeholder — not the application UI
        </p>
        <h1 className="text-2xl font-semibold">CDC Lab Accounts &amp; Asset Management System</h1>
        <p className="mt-2 text-gray-600">System online.</p>
        <p className="mt-6 text-sm text-gray-500">
          This page exists only to prove the Next.js scaffold runs end to end. The real interface
          will be built from the Google Stitch design once it is handed over — see{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">docs/UI_REQUIREMENTS.md</code>.
        </p>
      </div>
    </main>
  );
}
