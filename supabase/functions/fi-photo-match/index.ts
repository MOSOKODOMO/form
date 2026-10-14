import {handlePhotoMatch} from '../_shared/photo-match-handler.mjs';
// Keys are Supabase secrets set by a person in the dashboard: GEMINI_API_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL.
// GEMINI_MODEL is optional. Nothing here is secret except the keys.
Deno.serve(req=>handlePhotoMatch(req,{env:{
  publishableKey:'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5',
  geminiKey:Deno.env.get('GEMINI_API_KEY'),
  geminiModel:Deno.env.get('GEMINI_MODEL'),
  openrouterKey:Deno.env.get('OPENROUTER_API_KEY'),
  openrouterModel:Deno.env.get('OPENROUTER_MODEL'),
}}));
