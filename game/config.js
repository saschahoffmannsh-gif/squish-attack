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
// Current values: dedicated project tzkgqwvldlfbswdvyqgy ("squish-attack", eu-central-1).
// The leaderboard is read from {supabaseUrl}/rest/v1/sq_leaderboard with anonKey.
window.SQ_CONFIG = {
  supabaseUrl: "https://tzkgqwvldlfbswdvyqgy.supabase.co",
  anonKey: "sb_publishable__QxVxDRmON69TfkaOoPniw_GuAfFXr8",
  functionName: "squish",
  accessToken: "b0IyyZneW4G2ChkQ9a9WrPLe0TYMD5vtBCQNx1y1LOd"
};
