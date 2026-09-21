import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'

const SUPABASE_URL = 'https://dszagdjnymxalpwamjyh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
const $ = (selector) => document.querySelector(selector)
let session
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
    .eq('requester_user_id', session.user.id)
    .order('created_at', {ascending: false})
  if (error) throw error
  renderClientRequests(data || [])
}

async function loadManufacturerDashboard() {
  $('#manufacturer-dashboard').hidden = false
  const [applicationResult, reviewResult, membershipResult] = await Promise.all([
    supabase.from('fi_manufacturer_applications').select('*').eq('user_id', session.user.id).maybeSingle(),
    supabase.from('fi_manufacturer_application_reviews').select('*').eq('manufacturer_user_id', session.user.id).maybeSingle(),
    supabase.from('fi_supplier_memberships').select('supplier_id, role').ilike('email', session.user.email),
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
    user_id: session.user.id,
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

async function signOut() {
  await supabase.auth.signOut()
  location.replace('auth.html')
}

async function boot() {
  const { data } = await supabase.auth.getSession()
  session = data.session
  if (!session?.user) {
    location.replace('auth.html?next=account.html')
    return
  }
  $('#account-email').textContent = session.user.email
  try {
    let { data: storedProfile, error } = await supabase.from('fi_user_profiles').select('*').eq('user_id', session.user.id).maybeSingle()
    if (error) throw error
    if (!storedProfile) {
      const metadata = session.user.user_metadata || {}
      const fallbackRole = metadata.role === 'manufacturer' ? 'manufacturer' : 'client'
      const created = await supabase.from('fi_user_profiles').insert({
        user_id: session.user.id,
        role: fallbackRole,
        full_name: metadata.full_name || null,
        company_name: metadata.company_name || null,
      }).select('*').single()
      if (created.error) throw created.error
      storedProfile = created.data
    }
    profile = storedProfile
    $('#account-title').textContent = profile.full_name ? `Hi, ${profile.full_name}.` : 'Your Fabrication Intelligence account'
    if (profile.role === 'manufacturer') await loadManufacturerDashboard()
    else await loadClientDashboard()
    setStatus('#account-status', '')
  } catch (error) {
    console.error(error)
    setStatus('#account-status', 'We could not load your account. Please reload or contact FI if the problem continues.', 'error')
  }
}

$('#sign-out').addEventListener('click', signOut)
$('#manufacturer-form').addEventListener('submit', saveManufacturerApplication)
await boot()
