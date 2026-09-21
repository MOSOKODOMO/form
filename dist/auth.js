import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'

const SUPABASE_URL = 'https://dszagdjnymxalpwamjyh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const form = document.querySelector('#auth-form')
const signupFields = document.querySelector('#signup-fields')
const confirmField = document.querySelector('#confirm-field')
const companyField = document.querySelector('#company-field')
const status = document.querySelector('#auth-status')
const submit = document.querySelector('#auth-submit')
let mode = 'login'

function safeNextPath() {
  const next = new URLSearchParams(location.search).get('next') || 'account.html'
  if (next.startsWith('/') || next.includes('://') || next.startsWith('//')) return 'account.html'
  return /^[a-zA-Z0-9._/-]+(?:#[a-zA-Z0-9._-]+)?$/.test(next) ? next : 'account.html'
}

function setStatus(message, tone = '') {
  status.textContent = message
  status.className = `account-status ${tone}`.trim()
}

function selectedRole() {
  return form.elements.role?.value || 'client'
}

function updateRoleFields() {
  const manufacturer = selectedRole() === 'manufacturer'
  companyField.hidden = !manufacturer
  companyField.querySelector('input').required = mode === 'signup' && manufacturer
}

function setMode(nextMode) {
  mode = nextMode
  const signup = mode === 'signup'
  signupFields.hidden = !signup
  confirmField.hidden = !signup
  confirmField.querySelector('input').required = signup
  form.elements.full_name.required = signup
  form.elements.password.autocomplete = signup ? 'new-password' : 'current-password'
  document.querySelector('#auth-title').textContent = signup ? 'Create your account' : 'Welcome back'
  document.querySelector('#auth-copy').textContent = signup ? 'Choose your account type, then verify your email.' : 'Sign in to open your account.'
  submit.firstChild.textContent = signup ? 'Create account ' : 'Sign in '
  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.authMode === mode)))
  updateRoleFields()
  setStatus('')
}

async function handleSubmit(event) {
  event.preventDefault()
  setStatus('')
  if (!form.reportValidity()) return

  const values = Object.fromEntries(new FormData(form).entries())
  if (mode === 'signup' && values.password !== values.confirm_password) {
    setStatus('The passwords do not match.', 'error')
    form.elements.confirm_password.focus()
    return
  }

  submit.disabled = true
  setStatus(mode === 'signup' ? 'Creating your account…' : 'Signing in…')
  try {
    if (mode === 'signup') {
      const role = selectedRole()
      const redirectUrl = new URL('account.html', window.location.href).href
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            role,
            full_name: values.full_name.trim(),
            company_name: role === 'manufacturer' ? values.company_name.trim() : null,
          },
        },
      })
      if (error) throw error
      if (data.session) {
        location.assign(safeNextPath())
        return
      }
      form.reset()
      setMode('login')
      setStatus('Account created. Check your inbox to confirm your email, then sign in.', 'success')
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      })
      if (error) throw error
      location.assign(safeNextPath())
    }
  } catch (error) {
    console.error(error)
    setStatus(error.message || 'We could not complete that request. Please try again.', 'error')
  } finally {
    submit.disabled = false
  }
}

document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.authMode)))
form.querySelectorAll('[name="role"]').forEach((input) => input.addEventListener('change', updateRoleFields))
form.addEventListener('submit', handleSubmit)

const { data: { session } } = await supabase.auth.getSession()
if (session) location.replace(safeNextPath())
else setMode(new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login')
