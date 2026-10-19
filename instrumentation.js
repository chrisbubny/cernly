// Next.js instrumentation — runs once on server startup (Node.js runtime only)
// Used to ensure the DB schema is up to date before any requests are served.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureSlugColumn } = await import('./lib/store.js');
    await ensureSlugColumn().catch(e =>
      console.error('[Instrumentation] ensureSlugColumn failed:', e.message)
    );
  }
}
