import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'

const SUPABASE_URL = 'https://dszagdjnymxalpwamjyh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
const MAX_DRAWING_BYTES = 10 * 1024 * 1024
const allowedFileTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
const allowedFileExtensions = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx'])
const statusOrder = ['new', 'quoting', 'quotes_sent', 'won', 'lost']
const statusLabels = {new: 'New', quoting: 'Quoting', quotes_sent: 'Quotes sent', won: 'Won', lost: 'Lost'}
let language = 'en'
let adminRequests = []
let adminFilter = 'all'

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const todayISO = () => new Date().toISOString().slice(0, 10)
const text = (value) => String(value ?? '')

function applyLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  $$('[data-en]').forEach((node) => { node.textContent = language === 'zh' ? node.dataset.zh : node.dataset.en })
  $$('[data-placeholder-en]').forEach((node) => { node.placeholder = language === 'zh' ? node.dataset.placeholderZh : node.dataset.placeholderEn })
  $$('[data-lang]').forEach((node) => { node.setAttribute('aria-pressed', String(node.dataset.lang === language)) })
}

function setStatus(message, tone = '') {
  const node = $('#request-status')
  node.textContent = message
  node.className = tone
}

function setAdminStatus(message) {
  $('#admin-status').textContent = message
}

function safeFilename(filename) {
  const base = filename.normalize('NFKC').split(/[\\/]/).pop() || 'drawing'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
}

function fileExtension(filename) {
  return text(filename).toLowerCase().split('.').pop()
}

function showFieldError(name, message = '') {
  const field = document.querySelector(`[name="${name}"]`)
  const error = document.querySelector(`[data-error-for="${name}"]`)
  if (field) field.setAttribute('aria-invalid', String(Boolean(message)))
  if (error) error.textContent = message
}

function clearFormErrors() {
  $$('[data-error-for]').forEach((node) => { node.textContent = '' })
  $$('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'))
}

function validateRequest(values, file) {
  const errors = {}
  const required = ['requester_name', 'requester_email', 'project_name', 'category', 'material', 'quantity', 'delivery_date', 'destination_port', 'dimensions']
  required.forEach((key) => { if (!text(values[key]).trim()) errors[key] = language === 'zh' ? '请填写此项。' : 'Please complete this field.' })
  if (values.requester_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.requester_email)) errors.requester_email = language === 'zh' ? '请输入有效邮箱。' : 'Enter a valid email address.'
  if (values.quantity && (!Number.isSafeInteger(Number(values.quantity)) || Number(values.quantity) < 1)) errors.quantity = language === 'zh' ? '请输入不小于 1 的整数。' : 'Enter a whole number of at least 1.'
  if (values.delivery_date && values.delivery_date < todayISO()) errors.delivery_date = language === 'zh' ? '请选择今天或未来日期。' : 'Choose today or a future date.'
  if (file) {
    if (file.size > MAX_DRAWING_BYTES) errors.drawing = language === 'zh' ? '文件不能超过 10 MB。' : 'The file must be 10 MB or smaller.'
    if (!allowedFileTypes.has(file.type) && !allowedFileExtensions.has(fileExtension(file.name))) errors.drawing = language === 'zh' ? '请选择 PDF、图片或 DOCX 文件。' : 'Choose a PDF, image or DOCX file.'
  }
  Object.entries(errors).forEach(([key, message]) => showFieldError(key, message))
  return errors
}

function makeReference() {
  const date = todayISO().replaceAll('-', '')
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()
  return `FI-${date}-${suffix}`
}

async function submitRequest(event) {
  event.preventDefault()
  const form = $('#quote-form')
  const submit = form.querySelector('button[type="submit"]')
  const values = Object.fromEntries(new FormData(form).entries())
  const file = $('#drawing').files[0]
  clearFormErrors()
  if (values.website) return
  if (Object.keys(validateRequest(values, file)).length) {
    setStatus(language === 'zh' ? '请检查标出的字段。' : 'Please check the highlighted fields.', 'error-text')
    form.querySelector('[aria-invalid="true"]')?.focus()
    return
  }

  submit.disabled = true
  setStatus(language === 'zh' ? '正在安全上传并保存需求…' : 'Securely uploading and saving your request…')
  let drawingPath = null
  try {
    if (file) {
      drawingPath = `${crypto.randomUUID()}/${safeFilename(file.name)}`
      const { error: uploadError } = await supabase.storage.from('fi-drawings').upload(drawingPath, file, {upsert: false, contentType: file.type || 'application/octet-stream', cacheControl: '3600'})
      if (uploadError) throw uploadError
    }
    const payload = {
      reference: makeReference(),
      requester_name: values.requester_name.trim(),
      requester_email: values.requester_email.trim().toLowerCase(),
      company: values.company.trim() || null,
      project_name: values.project_name.trim(),
      category: values.category,
      material: values.material.trim(),
      quantity: Number(values.quantity),
      dimensions: values.dimensions.trim(),
      finish: values.finish.trim() || null,
      delivery_date: values.delivery_date,
      destination_port: values.destination_port,
      notes: values.notes.trim() || null,
      drawing_path: drawingPath,
      drawing_name: file?.name || null,
      drawing_size_bytes: file?.size || null,
      drawing_type: file?.type || null,
    }
    const { error: insertError } = await supabase.from('fi_quote_requests').insert(payload)
    if (insertError) throw insertError
    $('#confirmation-reference').textContent = payload.reference
    $('#confirmation').hidden = false
    form.reset()
    setStatus('')
    window.location.hash = 'confirmation'
  } catch (error) {
    console.error(error)
    setStatus(language === 'zh' ? '无法保存需求，请稍后重试。' : 'We could not save your request. Please try again.', 'error-text')
  } finally {
    submit.disabled = false
  }
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-AU', {year: 'numeric', month: 'short', day: 'numeric'}).format(new Date(value))
}

function formatBytes(value) {
  if (!value) return ''
  return `${(Number(value) / 1024 / 1024).toFixed(1)} MB`
}

function makeNode(tag, content = '', className = '') {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (content !== undefined) node.textContent = content
  return node
}

function renderAdminRequests() {
  const board = $('#request-board')
  board.replaceChildren()
  const visible = adminFilter === 'all' ? adminRequests : adminRequests.filter((row) => row.status === adminFilter)
  $$('.status-tab').forEach((button) => {
    const status = button.dataset.adminFilter
    const count = status === 'all' ? adminRequests.length : adminRequests.filter((row) => row.status === status).length
    button.querySelector('span').textContent = count
    button.classList.toggle('active', status === adminFilter)
  })
  if (!visible.length) {
    board.append(makeNode('div', adminRequests.length ? 'No requests in this view.' : 'No quote requests yet.', 'board-empty'))
    return
  }
  visible.forEach((row) => board.append(makeRequestCard(row)))
}

function makeRequestCard(row) {
  const card = makeNode('article', '', 'request-card')
  const head = makeNode('div', '', 'request-card-head')
  head.append(makeNode('span', row.reference, 'request-card-ref'), makeNode('span', formatDate(row.created_at), 'request-card-date'))
  card.append(head, makeNode('h4', row.project_name), makeNode('p', `${row.requester_name}${row.company ? ` · ${row.company}` : ''} · ${row.requester_email}`, 'request-card-contact'))
  const details = makeNode('dl')
  const detailRows = [['Category', row.category], ['Material', row.material], ['Quantity', `${row.quantity} units`], ['Dimensions', row.dimensions], ['Delivery', `${formatDate(row.delivery_date)} · ${row.destination_port}`], ['Finish', row.finish || 'Not specified']]
  detailRows.forEach(([label, value]) => { const item = makeNode('div'); item.append(makeNode('dt', label), makeNode('dd', value)); details.append(item) })
  card.append(details)
  if (row.notes) card.append(makeNode('div', row.notes, 'request-card-notes'))
  const footer = makeNode('div', '', 'request-card-footer')
  const statusLabel = makeNode('label', 'Status')
  const statusSelect = document.createElement('select')
  statusOrder.forEach((status) => { const option = makeNode('option', statusLabels[status]); option.value = status; option.selected = row.status === status; statusSelect.append(option) })
  statusSelect.addEventListener('change', () => updateRequestStatus(row, statusSelect.value))
  statusLabel.append(statusSelect)
  footer.append(statusLabel)
  if (row.drawing_path) {
    const attachment = makeNode('button', `${row.drawing_name || 'Drawing'}${row.drawing_size_bytes ? ` · ${formatBytes(row.drawing_size_bytes)}` : ''}`, 'attachment-button')
    attachment.type = 'button'
    attachment.addEventListener('click', () => openDrawing(row, attachment))
    footer.append(attachment)
  }
  card.append(footer)
  return card
}

async function updateRequestStatus(row, nextStatus) {
  setAdminStatus('Saving status…')
  const { data, error } = await supabase.from('fi_quote_requests').update({status: nextStatus, updated_at: new Date().toISOString()}).eq('id', row.id).select('*').single()
  if (error) {
    setAdminStatus('Could not update this request. Your session may have expired.')
    renderAdminRequests()
    return
  }
  adminRequests = adminRequests.map((item) => item.id === row.id ? data : item)
  setAdminStatus('')
  renderAdminRequests()
}

async function openDrawing(row, button) {
  button.disabled = true
  const { data, error } = await supabase.storage.from('fi-drawings').createSignedUrl(row.drawing_path, 300)
  button.disabled = false
  if (error) { setAdminStatus('Could not open the private drawing.'); return }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

async function loadAdminRequests() {
  setAdminStatus('Loading requests…')
  const { data, error } = await supabase.from('fi_quote_requests').select('*').order('created_at', {ascending: false})
  if (error) {
    setAdminStatus('Your account is not an approved FI team member, or your session has expired.')
    adminRequests = []
    renderAdminRequests()
    return
  }
  adminRequests = data || []
  setAdminStatus('')
  renderAdminRequests()
}

async function showAdminForSession(session) {
  if (!session?.user) return
  const { data: member, error } = await supabase.from('fi_team_members').select('email,role').eq('email', session.user.email).maybeSingle()
  if (error || !member) {
    await supabase.auth.signOut()
    setAdminStatus('This email is not on the FI team list.')
    return
  }
  $('#admin-auth').hidden = true
  $('#admin-dashboard').hidden = false
  $('#admin-user').textContent = session.user.email
  await loadAdminRequests()
}

async function bootAdmin() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) await showAdminForSession(session)
}

async function loginWithPassword(event) {
  event.preventDefault()
  setAdminStatus('Signing in…')
  const email = $('#admin-email').value.trim().toLowerCase()
  const password = $('#admin-password').value
  const { data, error } = await supabase.auth.signInWithPassword({email, password})
  if (error) { setAdminStatus('Password sign-in failed. Try the secure email link if you have not set a password.') ; return }
  await showAdminForSession(data.session)
}

async function sendMagicLink() {
  const email = $('#admin-email').value.trim().toLowerCase()
  if (!email) { setAdminStatus('Enter your team email first.'); return }
  setAdminStatus('Sending a secure sign-in link…')
  const { error } = await supabase.auth.signInWithOtp({email, options: {shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${window.location.pathname}#admin`}})
  setAdminStatus(error ? `Could not send the sign-in link: ${error.message}` : 'Check your inbox for the secure sign-in link.')
}

async function signOut() {
  await supabase.auth.signOut()
  $('#admin-auth').hidden = false
  $('#admin-dashboard').hidden = true
  $('#admin-password').value = ''
  setAdminStatus('')
}

$('#quote-form').addEventListener('submit', submitRequest)
$('#new-request-link').addEventListener('click', () => { $('#confirmation').hidden = true })
$('#admin-login-form').addEventListener('submit', loginWithPassword)
$('#magic-link-button').addEventListener('click', sendMagicLink)
$('#sign-out-button').addEventListener('click', signOut)
$$('[data-admin-filter]').forEach((button) => button.addEventListener('click', () => { adminFilter = button.dataset.adminFilter; renderAdminRequests() }))
$$('[data-lang]').forEach((button) => button.addEventListener('click', () => { language = button.dataset.lang; applyLanguage() }))
$('#drawing').addEventListener('change', () => { const file = $('#drawing').files[0]; if (file) setStatus(`${file.name} · ${formatBytes(file.size)}`) })
supabase.auth.onAuthStateChange((_event, session) => { if (session) showAdminForSession(session) })
applyLanguage()
bootAdmin()
