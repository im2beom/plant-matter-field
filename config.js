/*
 * PLANT MATTER RAINFOREST MEMORIES — Auth configuration
 * Fill the public project URL and PUBLISHABLE KEY (or legacy anon key) from Supabase.
 * NEVER include a service_role key or private secret in this file: GitHub Pages serves it publicly.
 */
window.PM_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabasePublishableKey: '',
  // Used only after deploying the authenticated 'delete-account' Edge Function.
  accountDeletionFunction: 'delete-account'
});
