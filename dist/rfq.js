'use strict';
let rfqBrief = {}, rfqId = null, rfqMode = 'edit', rfqErrors = {}, rfqSearch = '';
const rfqFields = [
  {id:'project',label:['Project name','项目名称'],required:true,max:120},
  {id:'category',label:['Product category','产品类别'],required:true,options:[['','Choose category','选择类别'],['stairs','Staircases','楼梯'],['facade','Facade panels','幕墙板'],['metalwork','Architectural metalwork','建筑金属构件'],['precast','Precast concrete','预制混凝土'],['other','Other','其他']]},
  {id:'material',label:['Material','材料'],required:true,max:120},
  {id:'quantity',label:['Quantity (units)','数量（件）'],type:'number',required:true},
  {id:'dimensions',label:['Dimensions, including units','尺寸（请注明单位）'],required:true,max:300},
  {id:'finish',label:['Finish / coating','饰面 / 涂层'],required:true,max:160},
  {id:'drawing',label:['Drawing filename (optional)','图纸文件名（选填）'],max:255,hint:['Filename only, e.g. stairs-rev-a.pdf. No file is uploaded or stored.','仅记录文件名，例如 stairs-rev-a.pdf。不会上传或保存文件。']},
  {id:'delivery',label:['Target delivery date','目标交付日期'],type:'date',required:true},
  {id:'port',label:['Destination port','目的港'],required:true,options:[['','Choose port','选择目的港'],['Melbourne','Melbourne','墨尔本'],['Sydney','Sydney','悉尼'],['Brisbane','Brisbane','布里斯班'],['Perth','Perth','珀斯']]},
  {id:'notes',label:['Additional requirements (optional)','补充要求（选填）'],type:'textarea',max:2000}
];
function captureRFQ(){const form=$('#rfq-form');if(form)rfqBrief=Object.fromEntries(new FormData(form));}
function rfqValidate(brief){
  const result={};
  for(const f of rfqFields){const value=String(brief[f.id]||'').trim();
    if(f.required&&!value)result[f.id]=t('Complete this field.','请填写此项。');
    else if(f.max&&value.length>f.max)result[f.id]=t('Please shorten this entry.','请缩短内容。');
    else if(f.options&&!f.options.some(o=>o[0]===value))result[f.id]=t('Choose a listed option.','请选择列表中的选项。');
  }
  if(brief.quantity&&(!Number.isSafeInteger(Number(brief.quantity))||Number(brief.quantity)<1))result.quantity=t('Enter a whole number of at least 1.','请输入不小于 1 的整数。');
  const date=new Date();const today=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  if(brief.delivery&&(!/^\d{4}-\d{2}-\d{2}$/.test(brief.delivery)||!Number.isFinite(Date.parse(brief.delivery))||brief.delivery<today))result.delivery=t('Choose today or a future date.','请选择今天或未来日期。');
  return result;
}
function rfqButton(en,zh,action,primary=false){const b=el('button',t(en,zh),primary?'primary':'secondary');b.type='button';b.onclick=action;return b;}
function rfqFailure(){const box=el('p',t('Unable to read or save browser storage. Existing data has not been replaced. Allow storage in your browser and try again. Keep a copy of your brief before leaving.','无法读取或保存浏览器数据。现有数据未被替换。请允许浏览器存储后重试，离开前请备份需求。'),'error');box.setAttribute('role','alert');$('#screen').prepend(box);}
function rfqSummary(screen,brief){const dl=el('dl');for(const f of rfqFields){const row=el('div');const option=f.options?.find(o=>o[0]===brief[f.id]);row.append(el('dt',t(...f.label)),el('dd',option?t(option[1],option[2]):String(brief[f.id]||t('Not provided','未提供'))));dl.append(row);}screen.append(dl);}
function rfqMatches(rows,query){const needle=query.trim().toLocaleLowerCase();return rows.filter(row=>[row.id,row.brief.project,row.brief.material].some(value=>String(value||'').toLocaleLowerCase().includes(needle)));}
function rfqText(brief,id,status=t('Saved locally · Not sent','已本地保存 · 未发送')){return ['Fabrication Intelligence',t('Quote request','询价需求'),id,...(status?[status]:[]),' ',...rfqFields.map(f=>{const option=f.options?.find(o=>o[0]===brief[f.id]);return t(...f.label)+': '+(option?t(option[1],option[2]):String(brief[f.id]||t('Not provided','未提供')));}), ' ',t('Drawing filename is a reference only; no drawing is attached.','图纸文件名仅为参考；未附带图纸。')].join('\n');}
function downloadRFQ(){
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rfqText(rfqBrief,rfqId)],{type:'text/plain;charset=utf-8'}));
  const link=el('a');link.href=url;link.download=String(rfqId).replace(/[^a-zA-Z0-9-]/g,'_')+'.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderRFQ(){
  $('#progress').hidden=true;
  $('#local-label').textContent=t('PILOT PREVIEW','试运行预览');
  $('#intro').replaceChildren(el('p','FABRICATION INTELLIGENCE','eyebrow'),el('h1',t('A clearer brief. A better starting point.','清晰的需求，更好的起点。')),el('p',t('Describe your project for our personally managed sourcing service. Start with the product, dimensions and delivery needs.','描述项目所需的产品、尺寸及交付要求，为人工采购协调服务做好准备。'),'intro-copy'),el('p',t('Save your request in this browser, then email it to us. We only see a request once you send that email. Clearing browser data removes saved requests; another device will not have them.','先在此浏览器保存需求，再通过邮件发送给我们。你发送邮件后我们才会看到需求。清除浏览器数据将删除已保存需求，其他设备无法访问。'),'notice'));
  renderFooter(t('Fabrication Intelligence · Pilot preview · No online orders or payments','Fabrication Intelligence · 试运行预览 · 不在线下单或付款'));
  const screen=$('#screen');
  if(view==='rfqs'){
    screen.append(el('h2',t('My RFQs','我的询价需求')),el('p',t('Requests saved in this browser. Open one to email it to us.','保存在此浏览器的需求。打开需求即可通过邮件发送给我们。'),'subheading'));
    screen.append(rfqButton('New request','新建需求',()=>{rfqBrief={};rfqId=null;rfqMode='edit';rfqErrors={};view='rfq';render(true);},true));
    const label=el('label',undefined,'field rfq-search');label.htmlFor='rfq-search';label.append(el('span',t('Search project, reference or material','搜索项目、编号或材料')));
    const search=el('input');search.id='rfq-search';search.type='search';search.value=rfqSearch;label.append(search);screen.append(label);
    const count=el('p',undefined,'saved-note');count.setAttribute('role','status');const list=el('div');screen.append(count,list);
    const refresh=()=>{list.replaceChildren();try{const rows=RFQStore.read();const matches=rfqMatches(rows,rfqSearch);count.textContent=t(matches.length+' saved requests shown', '显示 '+matches.length+' 条已保存需求');
      if(!matches.length)list.append(el('p',rows.length?t('No matching requests. Try another search.','没有匹配需求，请尝试其他关键词。'):t('No saved requests yet. Create a brief to get started.','尚无已保存需求。请先新建需求。'),'notice'));
      for(const row of matches){const card=el('article',undefined,'rfq-card');card.append(el('h3',String(row.brief.project||t('Untitled project','未命名项目'))),el('p',row.id,'rfq-reference'),el('p',t('Saved in this browser','已保存在此浏览器'),'rfq-status'),el('small',t('Updated: ','更新：')+new Date(row.updatedAt).toLocaleString(lang==='zh'?'zh-CN':'en-AU')),rfqButton('View request','查看需求',()=>{rfqBrief={...row.brief};rfqId=row.id;rfqMode='saved';view='rfq';render(true);}));list.append(card);}
    }catch{count.textContent='';rfqFailure();}};
    search.oninput=()=>{rfqSearch=search.value;refresh();};refresh();return;
  }
  if(rfqMode!=='edit'){
    screen.append(el('h2',rfqMode==='saved'?t('Saved request','已保存的需求'):t('Review your RFQ','核对询价需求')),el('p',rfqId||t('Ready to save in this browser','可保存在此浏览器'),'rfq-reference'));rfqSummary(screen,rfqBrief);
    screen.append(el('p',t('We look for suitable fabricators for you. Nothing is sent until you email this request to '+FI_CONTACT_EMAIL+'.','我们会为你寻找合适的制造商。你通过邮件将需求发送至 '+FI_CONTACT_EMAIL+' 后，我们才会收到。'),'notice'));
    const actions=el('div',undefined,'actions');actions.append(rfqButton('Edit brief','修改需求',()=>{rfqMode='edit';rfqErrors={};render(true);}));
    if(rfqMode==='review')actions.append(rfqButton('Save RFQ locally','本地保存询价需求',()=>{try{const row=RFQStore.save(rfqBrief,rfqId);rfqId=row.id;rfqMode='saved';render(true);}catch{rfqFailure();}},true));
    else actions.append(emailLink(t('Email this request to us','通过邮件发送需求'),t('Quote request','询价需求')+' — '+String(rfqBrief.project||'')+' ('+rfqId+')',rfqText(rfqBrief,rfqId,null)),rfqButton('Download brief (.txt)','下载需求（.txt）',downloadRFQ),rfqButton('My RFQs','我的询价需求',()=>{view='rfqs';render(true);}));screen.append(actions);return;
  }
  screen.append(el('h2',t('Build your quote request','创建询价需求')),el('p',t('Fields marked * are required. Use “Not sure” for materials or finish if you need advice.','标 * 为必填项。如需建议，材料或饰面可填写“不确定”。'),'subheading'));
  const form=el('form');form.id='rfq-form';form.noValidate=true;
  if(Object.keys(rfqErrors).length){const box=el('div',t('Please check the highlighted fields.','请检查标出的字段。'),'error');box.id='rfq-errors';box.tabIndex=-1;box.setAttribute('role','alert');form.append(box);}
  const grid=el('div',undefined,'fields');
  for(const f of rfqFields){const label=el('label',undefined,'field'+(f.type==='textarea'?' wide':''));label.htmlFor='rfq-'+f.id;label.append(el('span',t(...f.label)+(f.required?' *':'')));let input;
    if(f.options){input=el('select');for(const [value,en,zh]of f.options){const option=el('option',t(en,zh));option.value=value;input.append(option);}}
    else{input=el(f.type==='textarea'?'textarea':'input');if(f.type!=='textarea')input.type=f.type||'text';if(f.max)input.maxLength=f.max;}
    input.name=f.id;input.id='rfq-'+f.id;input.required=!!f.required;input.value=rfqBrief[f.id]||'';if(f.type==='number'){input.min='1';input.step='1';}
    label.append(input);const hints=[];
    if(f.hint){const hint=el('small',t(...f.hint));hint.id=input.id+'-hint';label.append(hint);hints.push(hint.id);}
    if(rfqErrors[f.id]){input.setAttribute('aria-invalid','true');input.classList.add('invalid');const error=el('small',rfqErrors[f.id]);error.id=input.id+'-error';label.append(error);hints.push(error.id);}
    if(hints.length)input.setAttribute('aria-describedby',hints.join(' '));grid.append(label);
  }
  form.append(grid,el('p',t('Prepare and save your brief, then email it to us. We look for suitable fabricators for you.','填写并保存需求，然后通过邮件发送给我们。我们会为你寻找合适的制造商。'),'notice'));
  const submit=el('button',t('Review RFQ →','核对需求 →'),'primary');submit.type='submit';const actions=el('div',undefined,'actions');actions.append(submit);form.append(actions);
  form.onsubmit=e=>{e.preventDefault();captureRFQ();rfqErrors=rfqValidate(rfqBrief);if(Object.keys(rfqErrors).length){render();$('#rfq-errors').focus();}else{rfqMode='review';render(true);}};screen.append(form);
}
if(new URLSearchParams(location.search).get('view')!=='catalogue'){view='rfq';render();}
