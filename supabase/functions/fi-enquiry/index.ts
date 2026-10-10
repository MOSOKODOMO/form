import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import {handleEnquiry} from '../_shared/enquiry-handler.mjs';
Deno.serve(req=>handleEnquiry(req,{
  client:createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}}),
  publishableKey:'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5',
}));
