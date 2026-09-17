'use strict';
// Staircase request data lives only in memory; the visitor sends it to the team by email (contact.js).
const $ = selector => document.querySelector(selector);
let lang = 'en', step = 0, values = {}, errors = {}, view = 'request';
const t = (en, zh) => lang === 'zh' ? zh : en;
const groups = [
  {title:['Your Melbourne project','你的墨尔本项目'],fields:[
    {id:'name',label:['Your name','你的姓名'],required:true,max:100},
    {id:'suburb',label:['Project suburb','项目所在区'],required:true,max:100},
    {id:'postcode',label:['Victorian postcode','维州邮编'],required:true,max:4,hint:['Enter 4 digits, e.g. 3000.','输入 4 位数字，例如 3000。']},
    {id:'email',label:['Your email','你的邮箱'],required:true,type:'email',max:254,hint:['We reply to this address.','我们会回复到此邮箱。']},
    {id:'phone',label:['Phone (optional)','电话（选填）'],type:'tel',max:30},
    {id:'stage',label:['Project stage','项目阶段'],options:[['ideas','Gathering ideas','收集灵感'],['plans','Plans prepared','已有图纸'],['building','Under construction','正在施工']]}
  ]},
  {title:['Your staircase','你的楼梯'],fields:[
    {id:'style',label:['Staircase style','楼梯风格'],options:[['unknown','Not sure yet','暂未确定'],['open','Open steel stringer','通透钢梁式'],['folded','Folded steel form','折板钢梯'],['timber','Timber staircase','木楼梯'],['other','Other — describe below','其他，请在下方说明']]},
    {id:'material',label:['Preferred materials','材质偏好'],options:[['unknown','Not sure yet','暂未确定'],['steel-timber','Steel frame + timber treads','钢结构 + 木踏步'],['steel','Steel','钢材'],['concrete','Precast concrete','预制混凝土'],['timber','Timber','木材'],['other','Other — describe below','其他，请在下方说明']]},
    {id:'height',label:['Floor-to-floor height (mm, optional)','层间高度（毫米，选填）'],type:'number',hint:['Finished lower floor to finished upper floor. Leave blank if unknown.','下层完成面至上层完成面的高度。不清楚可留空。']},
    {id:'width',label:['Staircase width (mm, optional)','楼梯宽度（毫米，选填）'],type:'number'},
    {id:'length',label:['Available horizontal length (mm, optional)','可用水平长度（毫米，选填）'],type:'number'},
    {id:'timing',label:['When do you need it?','希望何时交付？'],options:[['unknown','Not sure yet','暂未确定'],['3months','Within 3 months','3 个月内'],['6months','3–6 months','3–6 个月'],['later','More than 6 months','6 个月后']]},
    {id:'installation',label:['Installation needs','安装需求'],options:[['unknown','Need advice','需要建议'],['supply','Supply only — I have an installer','仅供货，已有安装方'],['install','Help finding local installation','希望协助寻找本地安装方']]},
    {id:'notes',label:['Project details (optional)','项目详情（选填）'],type:'textarea',wide:true,max:2000,hint:['Layout, finish, access constraints or other needs. Dimensions are preliminary, not production instructions.','可填写布局、饰面、现场通道限制等需求。尺寸仅用于初步了解，不可直接用于生产。']}
  ]},
  {title:['An existing local quote (optional)','已有本地报价（选填）'],fields:[
    {id:'quote',label:['Local quote amount (AUD)','本地报价金额（澳元）'],type:'number',hint:['Leave blank if you do not have a quote.','没有报价可留空。']},
    {id:'gst',label:['Does that amount include GST?','该金额是否含 GST？'],options:[['unknown','Not sure / no quote','不确定 / 无报价'],['included','GST included','含 GST'],['excluded','GST excluded','不含 GST']]},
    {id:'scope',label:['What does the quote include?','报价包含哪些项目？'],type:'textarea',wide:true,max:2000,hint:['For example: materials, delivery, engineering, installation. If unknown, say so. Required only when an amount is entered.','例如材料、运输、工程设计和安装。不清楚可注明。填写金额时需说明。']}
  ]}
];
const fields = groups.flatMap(g => g.fields);
function el(tag, text, className) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(className)n.className=className; return n; }
function readForm() { if(typeof captureRFQ === 'function')captureRFQ(); const form=$('#request-form'); if(form)values=Object.fromEntries(new FormData(form)); }
function validate() {
  const out={};
  for(const f of fields){const v=(values[f.id]||'').trim();
    if(f.required&&!v)out[f.id]=t('Please complete this field.','请填写此项。');
    if(f.max&&v.length>f.max)out[f.id]=t('Please shorten this entry.','请缩短此项内容。');
    if(f.type==='number'&&v!==''&&(!Number.isFinite(Number(v))||Number(v)<=0))out[f.id]=t('Enter a number greater than zero, or leave blank.','请输入大于零的数字，或留空。');
  }
  if(values.postcode&&!/^(3\d{3}|8\d{3})$/.test(values.postcode.trim()))out.postcode=t('Enter a 4-digit Victorian postcode starting with 3 or 8.','请输入以 3 或 8 开头的四位维州邮编。');
  if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))out.email=t('Enter a valid email address.','请输入有效的邮箱地址。');
  if(values.quote&&!values.scope?.trim())out.scope=t('Describe what the quote includes, or enter “unknown”.','请说明报价包含的项目，或填写“不清楚”。');
  return out;
}
function renderShell(){
  let nav=document.querySelector('.app-nav');
  if(!nav){nav=el('nav',undefined,'app-nav');document.querySelector('header').after(nav);}
  nav.replaceChildren();
  for(const [id,en,zh] of [['rfq','Build an RFQ','创建询价'],['rfqs','My RFQs','我的询价'],['request','Staircase request','楼梯需求'],['catalogue','Staircase catalogue','楼梯目录']]){const b=el('button',t(en,zh));b.type='button';b.setAttribute('aria-pressed',String(view===id));b.onclick=()=>{readForm();view=id;render(true);};nav.append(b);}

  document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.title=t('Fabrication Intelligence — Project request','Fabrication Intelligence — 项目需求');
  $('#local-label').textContent=t('PILOT PREVIEW','试运行预览');
  document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));
  const intro=$('#intro');intro.replaceChildren(el('p',t('MELBOURNE ↔ OVERSEAS MAKERS','墨尔本 ↔ 海外制造商'),'eyebrow'),el('h1',t('Could your staircase cost less?','你的楼梯，能否有更好的价格？')),el('p',t('Tell us what you need. We’re testing a sourcing service that connects Melbourne projects with overseas manufacturers, including China.','告诉我们你的需求。我们正在测试一项采购协调服务，连接墨尔本项目与包括中国在内的海外制造商。'),'intro-copy'));
  const how=el('div',undefined,'how');how.append(el('h3',t('The proposed service','拟议服务流程')));
  [t('Understand your requirements','了解你的需求'),t('Find manufacturers and clarify costs','寻找制造商并核实成本'),t('Compare equivalent delivered options','在同等范围内比较到货方案')].forEach((text,i)=>{const p=el('p');p.append(el('span',String(i+1).padStart(2,'0')),document.createTextNode(text));how.append(p);});intro.append(how);
  const figure=el('figure',undefined,'aside-image'),img=el('img');img.src='assets/staircase.jpg';img.width=1200;img.height=800;img.alt=t('AI concept of a steel and timber staircase','钢木楼梯的 AI 概念效果图');figure.append(img,el('figcaption',t('Concept image · Not a completed project','概念效果图 · 非已交付项目')));intro.append(figure,el('p',t('Pilot preview. Nothing is sent until you press Send request. Entries disappear when this page is reloaded. Savings and supply are not guaranteed.','试运行预览。点击“发送需求”前，我们不会收到任何内容；刷新页面后填写内容将消失。不保证节省费用或供货。'),'notice'));
  const progress=$('#progress');progress.replaceChildren();[t('Project details','填写需求'),t('Review','核对信息'),t('Confirmation','确认完成')].forEach((label,i)=>{const item=el('li');item.append(el('span',String(i+1).padStart(2,'0'),'step-number'),document.createTextNode(label));if(i===step)item.setAttribute('aria-current','step');progress.append(item);});
  renderFooter(t('Fabrication Intelligence · Pilot preview · No online orders or payments','Fabrication Intelligence · 试运行预览 · 不在线下单或付款'));
}
function renderForm(){
  const screen=$('#screen');screen.append(el('h2',t('Tell us about your project','告诉我们你的项目需求')),el('p',t('Start with what you know. Only your name, email, suburb and postcode are required.','从已知信息开始。仅姓名、邮箱、所在区及邮编为必填项。'),'subheading'));
  let replaceArmed=false;const sample=el('button',t('Use a sample Melbourne project','使用墨尔本示例项目'),'sample');sample.type='button';sample.onclick=()=>{readForm();if(!replaceArmed&&Object.values(values).some(v=>v.trim()&&!['unknown','ideas'].includes(v))){replaceArmed=true;sample.textContent=t('Replace entries with sample? Click again to confirm.','用示例替换当前内容？再次点击确认。');}else loadSample();};screen.append(sample);
  const form=el('form');form.id='request-form';form.noValidate=true;
  if(Object.keys(errors).length){const box=el('div',undefined,'error');box.id='errors';box.setAttribute('role','alert');box.tabIndex=-1;box.append(el('strong',t('Check these details before continuing','继续前请检查以下信息')));for(const [id,message]of Object.entries(errors)){const f=fields.find(f=>f.id===id),a=el('a',`${t(...f.label)}: ${message}`);a.href='#'+id;a.onclick=e=>{e.preventDefault();$('#'+id).focus();};box.append(a);}form.append(box);}
  for(const g of groups){const fs=el('fieldset');fs.append(el('legend',t(...g.title)));const grid=el('div',undefined,'fields');for(const f of g.fields){const label=el('label',undefined,'field'+(f.wide?' wide':''));label.htmlFor=f.id;label.append(el('span',t(...f.label)+(f.required?' *':'')));let input;
    if(f.options){input=el('select');for(const [value,en,zh]of f.options){const opt=el('option',t(en,zh));opt.value=value;input.append(opt);}}
    else{input=el(f.type==='textarea'?'textarea':'input');if(f.type!=='textarea')input.type=f.type||'text';if(f.type==='number'){input.min='0.01';input.step='any';input.inputMode='decimal';}if(f.max)input.maxLength=f.max;}
    input.id=f.id;input.name=f.id;if(f.required)input.required=true;if(f.id==='postcode')input.inputMode='numeric';if(f.id==='name')input.autocomplete='name';if(f.id==='email')input.autocomplete='email';if(f.id==='phone')input.autocomplete='tel';if(values[f.id]!==undefined)input.value=values[f.id];
    label.append(input);const descriptions=[];if(f.hint){const hint=el('small',t(...f.hint));hint.id=f.id+'-hint';label.append(hint);descriptions.push(hint.id);}if(errors[f.id]){input.classList.add('invalid');input.setAttribute('aria-invalid','true');const err=el('small',errors[f.id]);err.id=f.id+'-error';label.append(err);descriptions.push(err.id);}if(descriptions.length)input.setAttribute('aria-describedby',descriptions.join(' '));grid.append(label);
  }fs.append(grid);form.append(fs);}
  const actions=el('div',undefined,'actions'),review=el('button',t('Review my request →','核对我的需求 →'),'primary');review.type='submit';actions.append(review);form.append(actions,el('p',t('Next: review your information, then send it to us.','下一步：核对信息，然后发送给我们。'),'saved-note'));
  form.addEventListener('submit',e=>{e.preventDefault();readForm();errors=validate();for(const f of fields){const input=form.elements.namedItem(f.id);if(input.validity.badInput)errors[f.id]=t('Enter a valid number, or leave blank.','请输入有效数字，或留空。');}if(Object.keys(errors).length){render();$('#errors').focus();}else{step=1;render(true);}});screen.append(form);
}
function loadSample(){values={name:'Alex (sample)',email:'alex@example.com',suburb:'Richmond',postcode:'3121',stage:'plans',style:'open',material:'steel-timber',height:'2800',width:'1000',length:'4000',timing:'6months',installation:'install',notes:t('SAMPLE ONLY: indoor straight staircase, oak-look treads and dark steel frame. Measurements are unverified.','仅为示例：室内直梯，橡木色踏步、深色钢结构，尺寸未经核实。'),quote:'18000',gst:'included',scope:t('FICTIONAL QUOTE: staircase, delivery and installation. Engineering not specified. Sample data, not market pricing.','虚构报价：楼梯、运输和安装，未说明工程设计费用。仅为示例数据，并非市场价格。')};errors={};render(true);}
function displayValue(f){const v=values[f.id]?.trim();if(!v)return t('Not provided / unknown','未提供 / 不清楚');if(f.options){const opt=f.options.find(o=>o[0]===v);return opt?t(opt[1],opt[2]):v;}if(['height','width','length'].includes(f.id))return v+' mm';if(f.id==='quote')return new Intl.NumberFormat(lang==='zh'?'zh-CN':'en-AU',{style:'currency',currency:'AUD'}).format(Number(v))+' AUD';return v;}
function stairRequestText(){return [t('Staircase request','楼梯需求'),' ',...groups.flatMap(g=>[t(...g.title).toUpperCase(),...g.fields.map(f=>t(...f.label)+': '+displayValue(f)),' '])].join('\n');}
function stairRequestSubject(){return t('Staircase request','楼梯需求')+' — '+[values.suburb,values.postcode].map(v=>(v||'').trim()).filter(Boolean).join(' ');}
function renderReview(){const screen=$('#screen');screen.append(el('h2',t('Review your request','核对你的需求')),el('p',t('Check the details below. You can still go back and change anything.','请核对下方信息。你仍可返回修改任何内容。'),'subheading'));for(const g of groups){const section=el('section',undefined,'review-group');section.append(el('h3',t(...g.title)));const dl=el('dl');for(const f of g.fields){const row=el('div');row.append(el('dt',t(...f.label)),el('dd',displayValue(f)));dl.append(row);}section.append(dl);screen.append(section);}screen.append(el('p',t('These are preliminary requirements. No pricing, engineering assessment or manufacturer availability has been confirmed. Send request emails these details to Fabrication Intelligence through FormSubmit, a form delivery service.','以上仅为初步需求，尚未确认价格、工程评估或制造商供货情况。点击“发送需求”后，以上信息将通过表单发送服务 FormSubmit 发送至 Fabrication Intelligence。'),'notice'));const actions=el('div',undefined,'actions'),edit=el('button',t('← Edit details','← 修改信息'),'secondary');edit.type='button';edit.onclick=()=>{step=0;render(true);};actions.append(edit,sendButton(t('Send request','发送需求'),()=>({subject:stairRequestSubject(),name:values.name,replyTo:values.email,text:stairRequestText()}),()=>{step=2;render(true);}));screen.append(actions);}
function renderConfirmation(){const screen=$('#screen');screen.append(el('div','✓','success-icon'),el('h2',t('Request sent','需求已发送')),el('p',t('Thanks. Your request has been emailed to Fabrication Intelligence. We’ll reply to '+(values.email||'your email')+'.','谢谢。你的需求已发送至 Fabrication Intelligence，我们会回复到 '+(values.email||'你的邮箱')+'。'),'subheading'));const next=el('div',undefined,'next');next.append(el('h3',t('What happens next?','接下来会发生什么？')));const list=el('ol');[t('We reply to clarify any missing details.','我们会回复你，确认缺失的需求信息。'),t('We approach suitable manufacturers for quotes.','我们会向适合的制造商询价。'),t('You review comparable costs and decide whether to proceed.','你会查看同等范围的成本比较，再决定是否继续。')].forEach(s=>list.append(el('li',s)));next.append(list);screen.append(next,el('p',t('This page doesn’t keep your request after a reload. Questions? Email '+FI_CONTACT_EMAIL+'.','刷新页面后本页不会保留你的需求。如有疑问，请发送邮件至 '+FI_CONTACT_EMAIL+'。'),'notice'));const actions=el('div',undefined,'actions'),review=el('button',t('View my request','查看我的需求'),'secondary'),restart=el('button',t('Start another request','新建需求'),'primary');review.type='button';restart.type='button';review.onclick=()=>{step=1;render(true);};restart.onclick=()=>{values={};errors={};step=0;render(true);};actions.append(review,restart);screen.append(actions);}
function render(focus=false){renderShell();const screen=$('#screen');screen.replaceChildren();screen.classList.remove('catalogue-screen');$('#progress').hidden=false;if((view==='rfq'||view==='rfqs')&&typeof renderRFQ==='function')renderRFQ();else if(view==='catalogue'&&typeof renderCatalogue==='function')renderCatalogue();else if(step===0)renderForm();else if(step===1)renderReview();else renderConfirmation();if(focus){screen.tabIndex=-1;screen.focus();screen.scrollIntoView({block:'start'});}}
document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>{readForm();lang=button.dataset.lang;if(typeof rfqValidate==='function'&&Object.keys(rfqErrors).length)rfqErrors=rfqValidate(rfqBrief);if(Object.keys(errors).length)errors=validate();render();}));
render();
