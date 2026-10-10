const origins=new Set(['https://fabricationintelligence.com','https://www.fabricationintelligence.com','http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:8879']);
const positions=new Set(['warehouse-inspector','marketing-content','supplier-sourcing','customer-support']);
export async function handleEnquiry(req,{client,publishableKey,cryptoImpl=crypto}) {
  const origin=req.headers.get('origin') || '';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin'};
  if(origins.has(origin)) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS'});
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin && !origins.has(origin)) return reply({error:'Origin not allowed.'},403);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(req.method!=='POST') return reply({error:'POST required.'},405);
  if(!publishableKey || req.headers.get('apikey')!==publishableKey) return reply({error:'Website API key required.'},401);
  const raw=await req.text();
  if(raw.length>12000) return reply({error:'Message is too large.'},413);
  let input; try{input=JSON.parse(raw);}catch{return reply({error:'Invalid message.'},400);}
  if(!input || typeof input!=='object' || Array.isArray(input)) return reply({error:'Invalid message.'},400);
  const text=(name,max,required=false)=>{const value=String(input[name] || '').trim();if(value.length>max || (required && !value))throw new Error(`Check ${name}.`);return value;};
  let data,key;
  try {
    if(text('website',200)) return reply({saved:false});
    key=text('submission_key',36,true);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new Error('Invalid message reference.');
    const relationship=text('relationship',20,true),position=relationship==='applicant'?text('position',40,true):null,portfolio=relationship==='applicant'?(text('portfolio',500)||null):null;
    if(!['buyer','supplier','applicant'].includes(relationship)) throw new Error('Choose buyer, supplier or join the team.');
    if(position && !positions.has(position)) throw new Error('Choose an available position.');
    const email=text('email',200,true);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Check your email address.');
    if(portfolio && !['https:','http:'].includes(new URL(portfolio).protocol)) throw new Error('Use a full CV or portfolio link.');
    data={name:text('name',120,true),email,relationship,product:text('product',200),message:text('message',4000,true),position,portfolio};
  } catch(error) {return reply({error:error.message || 'Check your message.'},400);}
  const day=new Date().toISOString().slice(0,10),ip=(req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const digest=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(`${day}:${ip}`));
  const rateKey=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const {data:id,error}=await client.rpc('fi_capture_enquiry',{p_key:key,p_rate_key:rateKey,p_data:data});
  if(error) return reply({error:error.code==='P0001'?'Too many enquiries. Please try again later or email FI.':'Your note could not be saved. Please try again or email FI.'},error.code==='P0001'?429:503);
  return reply({saved:true,id});
}
