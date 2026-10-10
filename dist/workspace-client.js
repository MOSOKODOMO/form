import {supabase, node, money, safeLink} from './commerce-client.js';
import {isAuthSessionMissingError} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
export {supabase, node, money, safeLink};
export const $ = selector => document.querySelector(selector);
export const label = value => String(value || 'Not recorded').replaceAll('_',' ');
export const date = value => value ? new Date(value).toLocaleDateString('en-AU') : 'Not recorded';
export function dashboardPath(access) {
  return access.admin ? 'admin.html' : access.supplier || access.supplier_requested ? 'supplier.html' : 'customer.html';
}
export function message(text, error = false) {
  $('#workspace-status').textContent = text;
  $('#workspace-status').className = `account-status${error ? ' error' : ''}`;
}
export async function rpc(name) {
  const {data,error} = await supabase.rpc(name);
  if (error) throw error;
  return data;
}
export async function authorize(kind) {
  const {data:{user},error} = await supabase.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) throw new Error('We could not verify your account. Please try again.');
  if (!user) {
    location.replace(`auth.html?next=${kind === 'router' ? 'dashboard.html' : `${kind}.html`}`);
    return null;
  }
  const access = await rpc('fi_workspace_context');
  if (kind === 'admin' && !access.admin) throw new Error('This dashboard is restricted to approved FI administrators.');
  if (kind === 'supplier' && !access.supplier && !access.supplier_requested) throw new Error('A supplier account or approved supplier membership is required.');
  if ($('#workspace-name')) $('#workspace-name').textContent = access.name ? `Welcome, ${access.name}.` : 'Your FI workspace.';
  if ($('#admin-navigation')) $('#admin-navigation').hidden = !access.admin;
  return {user,access};
}
export function stats(entries) {
  const list = $('#workspace-stats'); list.replaceChildren();
  for (const [title,value] of entries) {
    const card = node('div',null,'workspace-stat');
    card.append(node('span',title),node('strong',value)); list.append(card);
  }
}
export function empty(target,text) { $(target).replaceChildren(node('p',text,'account-empty')); }
export function table(target,headers,rows) {
  const root = $(target); root.replaceChildren();
  if (!rows.length) { empty(target,'No records yet.'); return; }
  const grid = node('table'),head = node('thead'),tr = node('tr'),body = node('tbody');
  headers.forEach(text => {const th=node('th',text); th.scope='col'; tr.append(th);}); head.append(tr);
  rows.forEach(row => {const tr=node('tr'); row.forEach(value => {const td=node('td'); td.append(value && typeof value==='object' ? value : node('span',value)); tr.append(td);}); body.append(tr);});
  grid.append(head,body); root.append(grid);
}
export function link(href,text) { const a=node('a',text,'text-link'); a.href=href; return a; }
export function setVisible(visible) { if ($('#workspace')) $('#workspace').hidden=!visible; }
export async function run(loader) {
  setVisible(false); message('Checking account access…');
  try { await loader(); } catch(error) { setVisible(false); message(error.message || 'The dashboard could not be loaded. Please try again.',true); }
}
if ($('#workspace-signout')) $('#workspace-signout').addEventListener('click',async()=>{
  const {error}=await supabase.auth.signOut();
  if(error) message('We could not sign you out. Please try again.',true);
  else {setVisible(false); location.replace('auth.html');}
});
supabase.auth.onAuthStateChange(event => { if(event==='SIGNED_OUT') {setVisible(false); location.replace('auth.html');} });
