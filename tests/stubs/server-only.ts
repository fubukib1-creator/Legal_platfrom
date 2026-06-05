// No-op replacement for `server-only` so modules that import it are usable in
// vitest. Real production code still throws when these modules are imported
// from a Client Component bundle.
export {};
