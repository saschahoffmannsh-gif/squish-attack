// Backend connection for Squish attack.
//
// To point the game at a different (e.g. a new, dedicated) Supabase project,
// change these four values - nothing else in the client needs to change:
//   supabaseUrl  https://<PROJECT_REF>.supabase.co          (Dashboard > Project Settings > API)
//   anonKey      the project's anon / publishable key        (public by design; RLS blocks direct table access)
//   functionName "squish"                                     (Edge Function slug)
//   accessToken  the plain value whose SHA-256 is stored in public.sq_access (id = 'gate').
//                It ships to every browser, so it is a bundle check, not a secret.
// Optional: apiUrl overrides the full function URL (e.g. a local `supabase functions serve`).
//
// Current values: shared project wlujgkbtpjxuekwsgnmg ("galaxy-empire").
window.SQ_CONFIG = {
  supabaseUrl: "https://wlujgkbtpjxuekwsgnmg.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsdWpna2J0cGp4dWVrd3Nnbm1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5Nzk0MjIsImV4cCI6MjEwNzU1NTQyMn0.IPX_Vco2kJurtnZUAcNFYcZ4hs2nT6n6e8apIhZfhTk",
  functionName: "squish",
  accessToken: "eTz3OeKXM3ysmAK4wpSKCgS70DTudbEMtaF4xJmt7M8"
};
