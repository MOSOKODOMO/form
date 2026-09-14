'use strict';
let language = 'en';
let brief = null;
const form = document.getElementById('project-form');
const result = document.getElementById('form-result');
function renderBrief() {
  if (!brief) return;
  const zh = language === 'zh';
  const styles = zh ? {unsure:'想先了解更多选择',open:'通透中梁',folded:'折线形态',timber:'木韵线条'} : {unsure:'Let’s explore options',open:'The Open Stringer',folded:'The Folded Form',timber:'The Timber Line'};
  const stages = zh ? {ideas:'收集灵感',plans:'已有图纸',building:'正在施工'} : {ideas:'Gathering ideas',plans:'Plans prepared',building:'Under construction'};
  result.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = zh ? '你的项目摘要' : 'Your project brief';
  result.append(heading);
  const lines = zh ? [`姓名：${brief.name}`,`项目邮编：${brief.postcode}`,`设计方向：${styles[brief.style]}`,`项目阶段：${stages[brief.stage]}`] : [`Name: ${brief.name}`,`Project postcode: ${brief.postcode}`,`Design direction: ${styles[brief.style]}`,`Project stage: ${stages[brief.stage]}`];
  if (brief.notes) lines.push((zh ? '项目想法：' : 'Project notes: ') + brief.notes);
  for (const line of lines) { const p = document.createElement('p'); p.textContent = line; result.append(p); }
  const note = document.createElement('p'); note.className = 'caption'; note.textContent = zh ? '演示摘要已生成，未发送任何内容。你可以修改上方信息并重新预览。' : 'Demo summary created. Nothing has been sent. Edit the form above to update your brief.'; result.append(note);
  result.hidden = false;
}
function setLanguage(next) {
  language = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  document.title = next === 'zh' ? 'FORM / 构阶 — 以新视角，构筑每一步' : 'FORM / 构阶 — A new perspective on stairs';
  document.querySelector('meta[name="description"]').content = next === 'zh' ? '连接澳大利亚项目与中国匠造的定制楼梯概念网站。中英双语演示。' : 'Explore a concept for bespoke staircases connecting Australian projects with Chinese craftsmanship. English and Chinese website demo.';
  document.querySelectorAll('[data-en]').forEach(el => {
    const text = el.dataset[next];
    // Only authored headline line breaks are interpreted; user input uses textContent.
    const parts = text.split('<br>'); el.replaceChildren();
    parts.forEach((part, index) => { if (index) el.append(document.createElement('br')); el.append(document.createTextNode(part)); });
  });
  document.querySelectorAll('[data-en-placeholder]').forEach(el => el.placeholder = el.getAttribute(`data-${next}-placeholder`));
  document.querySelectorAll('[data-en-alt]').forEach(el => el.alt = el.getAttribute(`data-${next}-alt`));
  document.querySelectorAll('[data-en-aria]').forEach(el => el.setAttribute('aria-label', el.getAttribute(`data-${next}-aria`)));
  document.querySelectorAll('[data-lang]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.lang === next)));
  try { localStorage.setItem('form-site-language', next); } catch (_) { /* Optional preference only. */ }
  renderBrief();
}
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.lang)));
document.querySelectorAll('.choose-style').forEach(button => button.addEventListener('click', () => {
  form.elements.style.value = button.dataset.style;
  document.getElementById('enquiry').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  form.elements.style.focus({preventScroll:true});
}));
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  brief = Object.fromEntries(new FormData(form));
  brief.name = brief.name.trim(); brief.notes = brief.notes.trim();
  if (!brief.name) { form.elements.name.setCustomValidity(language === 'zh' ? '请输入姓名。' : 'Please enter your name.'); form.elements.name.reportValidity(); return; }
  renderBrief(); result.focus({preventScroll:true}); result.scrollIntoView({block:'nearest',behavior:'smooth'});
});
form.elements.name.addEventListener('input', () => form.elements.name.setCustomValidity(''));
try { const saved = localStorage.getItem('form-site-language'); if (saved === 'zh' || saved === 'en') setLanguage(saved); } catch (_) { /* Default English remains usable. */ }
