import { createClient, isAuthSessionMissingError } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'

const SUPABASE_URL = 'https://dszagdjnymxalpwamjyh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
const $ = (selector) => document.querySelector(selector)
let currentUser
let profile
let application
let applicationReview

function setStatus(id, message, tone = '') {
  const node = $(id)
  node.textContent = message
  node.className = `account-status ${tone}`.trim()
}

function fillForm(form, values) {
  Object.entries(values || {}).forEach(([key, value]) => {
    const field = form.elements.namedItem(key)
    if (field && value !== null) field.value = value
  })
}

function friendlyStatus(review, submittedAt) {
  if (review?.status) return review.status.replaceAll('_', ' ')
  return submittedAt ? 'submitted' : 'draft'
}

function validatedProfileFields(form) {
  const fullName = form.elements.full_name.value.trim()
  const companyName = form.elements.company_name.value.trim()
  if (fullName.length < 1 || fullName.length > 160) {
    setStatus('#profile-status', 'Enter a full name of up to 160 characters.', 'error')
    form.elements.full_name.focus()
    return null
  }
  if (companyName.length > 200 || (profile.role === 'manufacturer' && companyName.length < 1)) {
    setStatus('#profile-status', 'Enter a company name of up to 200 characters.', 'error')
    form.elements.company_name.focus()
    return null
  }
  return {full_name: fullName, company_name: companyName || null}
}

async function saveProfile(event) {
  event.preventDefault()
  const form = event.currentTarget
  if (!form.reportValidity()) return
  const fields = validatedProfileFields(form)
  if (!fields) return
  const button = $('#profile-save')
  button.disabled = true
  setStatus('#profile-status', 'Saving your details…')
  try {
    const {data, error} = await supabase.from('fi_user_profiles')
      .update({...fields, updated_at: new Date().toISOString()})
      .eq('user_id', currentUser.id)
      .select('user_id, role, full_name, company_name')
      .single()
    if (error) throw error
    profile = data
    $('#account-title').textContent = 'Hi, ' + profile.full_name + '.'
    setStatus('#profile-status', 'Your details were saved.', 'success')
  } catch (error) {
    setStatus('#profile-status', error?.message || 'We could not save your details. Please try again.', 'error')
  } finally {
    button.disabled = false
  }
}

function renderClientRequests(rows) {
  const list = $('#client-requests')
  list.replaceChildren()
  if (!rows.length) {
    const empty = document.createElement('div')
    empty.className = 'account-empty'
    empty.innerHTML = '<strong>No signed-in requests yet.</strong><p>Start with the item you cannot source. Your next request will be saved to this account.</p>'
    list.append(empty)
    return
  }
  rows.forEach((row) => {
    const card = document.createElement('article')
    card.className = 'account-request-card'
    const head = document.createElement('div')
    const reference = document.createElement('span')
    reference.textContent = row.reference
    const status = document.createElement('span')
    status.className = `request-status ${row.status}`
    status.textContent = row.status.replaceAll('_', ' ')
    head.append(reference, status)
    const heading = document.createElement('h3')
    heading.textContent = row.project_name
    const details = document.createElement('p')
    details.textContent = `${row.category} · ${row.material} · ${row.quantity} units · ${row.destination_port}`
    const date = document.createElement('small')
    date.textContent = `Submitted ${new Intl.DateTimeFormat('en-AU', {dateStyle: 'medium'}).format(new Date(row.created_at))}`
    card.append(head, heading, details, date)
    list.append(card)
  })
}

async function loadClientDashboard() {
  $('#client-dashboard').hidden = false
  const { data, error } = await supabase
    .from('fi_quote_requests')
    .select('id, reference, created_at, status, project_name, category, material, quantity, destination_port')
    .eq('requester_user_id', currentUser.id)
    .order('created_at', {ascending: false})
  if (error) throw error
  renderClientRequests(data || [])
}

async function loadManufacturerDashboard() {
  $('#manufacturer-dashboard').hidden = false
  const [applicationResult, reviewResult, membershipResult] = await Promise.all([
    supabase.from('fi_manufacturer_applications').select('*').eq('user_id', currentUser.id).maybeSingle(),
    supabase.from('fi_manufacturer_application_reviews').select('*').eq('manufacturer_user_id', currentUser.id).maybeSingle(),
    supabase.from('fi_supplier_memberships').select('supplier_id, role').eq('email', currentUser.email),
  ])
  if (applicationResult.error) throw applicationResult.error
  if (reviewResult.error) throw reviewResult.error
  if (membershipResult.error) console.warn('Supplier workspace membership is not configured yet.', membershipResult.error)
  application = applicationResult.data
  applicationReview = reviewResult.data
  fillForm($('#manufacturer-form'), application || {company_name: profile.company_name || '', country: 'China'})
  const displayStatus = friendlyStatus(reviewResult.data, application?.submitted_at)
  $('#application-badge').textContent = displayStatus
  $('#application-badge').className = `account-badge ${displayStatus.replaceAll(' ', '_')}`
  if (reviewResult.data?.review_note) {
    $('#review-note').hidden = false
    $('#review-note').textContent = `FI review note: ${reviewResult.data.review_note}`
  }
  if (membershipResult.data?.length) $('#approved-supplier').hidden = false
}

async function saveManufacturerApplication(event) {
  event.preventDefault()
  const action = event.submitter?.dataset.action || 'save'
  const requiredForSubmission = ['company_name', 'country', 'product_categories', 'capabilities']
  requiredForSubmission.forEach((name) => {
    const field = event.currentTarget.elements.namedItem(name)
    field.value = field.value.trim()
    field.toggleAttribute('required', action === 'submit' || Boolean(application?.submitted_at))
  })
  if (!event.currentTarget.reportValidity()) {
    setStatus('#manufacturer-status', 'Complete the required company and capability fields before submitting.', 'error')
    return
  }
  const values = Object.fromEntries(new FormData(event.currentTarget).entries())
  const payload = {
    user_id: currentUser.id,
    company_name: values.company_name.trim() || null,
    country: values.country.trim() || null,
    website: values.website.trim() || null,
    product_categories: values.product_categories.trim() || null,
    capabilities: values.capabilities.trim() || null,
    certifications: values.certifications.trim() || null,
    notes: values.notes.trim() || null,
    submitted_at: action === 'submit' ? new Date().toISOString() : application?.submitted_at || null,
    updated_at: new Date().toISOString(),
  }
  setStatus('#manufacturer-status', action === 'submit' ? 'Submitting your application…' : 'Saving your draft…')
  const { data, error } = await supabase.from('fi_manufacturer_applications').upsert(payload, {onConflict: 'user_id'}).select('*').single()
  if (error) {
    setStatus('#manufacturer-status', error.message || 'We could not save the application.', 'error')
    return
  }
  application = data
  $('#application-badge').textContent = friendlyStatus(applicationReview, data.submitted_at)
  setStatus('#manufacturer-status', action === 'submit' ? 'Application submitted to FI for review.' : 'Draft saved.', 'success')
}

function paymentAmount(row) {
  const currency = String(row.currency || '').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(row.amount_minor) || row.amount_minor < 0) return 'Amount unavailable'
  try {
    const formatter = new Intl.NumberFormat('en-AU', {style: 'currency', currency})
    const decimals = formatter.resolvedOptions().maximumFractionDigits
    return formatter.format(row.amount_minor / (10 ** decimals))
  } catch {
    return 'Amount unavailable'
  }
}

function renderPayments(rows) {
  const list = $('#account-payments')
  list.replaceChildren()
  if (!rows.length) {
    const empty = document.createElement('div')
    empty.className = 'account-empty'
    const heading = document.createElement('strong')
    heading.textContent = 'No payments yet.'
    const copy = document.createElement('p')
    copy.textContent = 'Payment requests will appear here after FI confirms your quote.'
    empty.append(heading, copy)
    list.append(empty)
    return
  }
  const labels = {
    awaiting_payment: 'Awaiting payment',
    processing: 'Processing',
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    cancelled: 'Cancelled',
  }
  rows.forEach((row) => {
    const card = document.createElement('article')
    card.className = 'account-payment-card'
    const heading = document.createElement('h3')
    heading.textContent = row.description || 'FI payment request'
    const amount = document.createElement('p')
    amount.className = 'account-payment-amount'
    amount.textContent = paymentAmount(row)
    const state = document.createElement('span')
    state.className = 'account-badge'
    state.textContent = labels[row.status] || 'Status unavailable'
    const date = document.createElement('small')
    const when = row.paid_at && row.status === 'paid' ? row.paid_at : row.created_at
    const parsed = new Date(when)
    date.textContent = Number.isNaN(parsed.valueOf()) ? '' :
      (row.paid_at && row.status === 'paid' ? 'Paid ' : 'Created ') +
      new Intl.DateTimeFormat('en-AU', {dateStyle: 'medium'}).format(parsed)
    card.append(heading, amount, state, date)
    list.append(card)
  })
}

async function loadPayments() {
  $('#payments-dashboard').hidden = false
  const {data, error} = await supabase.from('fi_account_payments')
    .select('id, description, amount_minor, currency, status, created_at, paid_at')
    .eq('customer_user_id', currentUser.id)
    .order('created_at', {ascending: false})
  if (error) {
    $('#account-payments').replaceChildren()
    setStatus('#payments-status', 'Payments are unavailable right now. Please try again later or contact FI.', 'error')
    return
  }
  setStatus('#payments-status', '')
  renderPayments(data || [])
}

async function signOut() {
  const {error} = await supabase.auth.signOut()
  if (error) setStatus('#account-status', 'We could not sign you out. Please try again.', 'error')
  else location.replace('auth.html')
}

async function boot() {
  const {data: {user}, error: userError} = await supabase.auth.getUser()
  if (userError && !isAuthSessionMissingError(userError)) {
    setStatus('#account-status', 'We could not verify your account. Please reload and try again.', 'error')
    return
  }
  if (!user) {
    location.replace('auth.html?next=account.html')
    return
  }
  currentUser = user
  $('#account-email').textContent = currentUser.email
  try {
    const {data: storedProfile, error} = await supabase.from('fi_user_profiles')
      .select('user_id, role, full_name, company_name')
      .eq('user_id', currentUser.id)
      .maybeSingle()
    if (error) throw error
    if (!storedProfile) throw new Error('Your account profile is not ready. Please contact FI; do not create a second account.')
    profile = storedProfile
    fillForm($('#profile-form'), profile)
    $('#profile-form').elements.company_name.required = profile.role === 'manufacturer'
    $('#profile-card').hidden = false
    $('#account-title').textContent = profile.full_name ? `Hi, ${profile.full_name}.` : 'Your Fabrication Intelligence account'
    if (profile.role === 'manufacturer') await loadManufacturerDashboard()
    else await loadClientDashboard()
    await loadPayments()
    setStatus('#account-status', '')
    const membership = await supabase.from('fi_team_members').select('role').eq('email', currentUser.email.toLowerCase()).maybeSingle()
    if (!membership.error && membership.data) $('#commerce-admin-link').hidden = false
  } catch (error) {
    setStatus('#account-status', error?.message || 'We could not load your account. Please reload or contact FI if the problem continues.', 'error')
  }
}

$('#sign-out').addEventListener('click', signOut)
$('#profile-form').addEventListener('submit', saveProfile)
$('#manufacturer-form').addEventListener('submit', saveManufacturerApplication)
await boot()
