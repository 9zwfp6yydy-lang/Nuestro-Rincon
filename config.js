/* =====================================================================
   config.js — Configuración de Nuestro Rincón
   Rellena estos tres huecos cuando publiques la app (ver README.md).
   Mientras estén vacíos, la app carga igual y muestra un aviso amable
   de «falta configurar» en vez de romperse.
   ===================================================================== */
window.APP_CONFIG = {
  // Proyecto de Supabase: Ajustes → API → Project URL
  SUPABASE_URL: 'https://gmnqcixtztvhlljbumlz.supabase.co',
  // Proyecto de Supabase: Ajustes → API → anon public (esta sí va en el cliente)
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbnFjaXh0enR2aGxsamJ1bWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0OTEwOTcsImV4cCI6MjEwOTA2NzA5N30.DxZHkExZpyHetFNokaiUXF-nnRcQbIWoDl77qWXts-E',
  // Google Cloud Console → YouTube Data API v3 → clave de API (gratuita)
  // Proyecto «Nuestro Rincon» (nuestro-rincon-513321), clave restringida a YouTube Data API v3 — 2026-10-31
  YOUTUBE_API_KEY: 'AIzaSyDRdEzMtgatBYkVbRDFaCpkVuVz8ASLIGA',
  // Web Push (avisos de llamada): clave PÚBLICA VAPID. La privada NO va aquí:
  // vive solo como secreto de la Edge Function (ver push-keys.local.txt y README).
  VAPID_PUBLIC_KEY: 'BDus-lYj69a-i99xUZsBfYgzesSsIRvsFoQGEo6lcJe6P6TMozRVyhZ_lw8cT4XiKI94eoBV6MT4r_JD39btY7U'
};
