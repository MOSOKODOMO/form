import { createClient, isAuthSessionMissingError } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'

const SUPABASE_URL = 'https://dszagdjnymxalpwamjyh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const form = document.querySelector('#auth-form')
const tabs = document.querySelector('#auth-tabs')
const signupFields = document.querySelector('#signup-fields')
const emailField = document.querySelector('#email-field')
const passwordField = document.querySelector('#password-field')
const confirmField = document.querySelector('#confirm-field')
const companyField = document.querySelector('#company-field')
const forgotButton = document.querySelector('#forgot-password')
const backButton = document.querySelector('#back-to-signin')
const status = document.querySelector('#auth-status')
const submit = document.querySelector('#auth-submit')
let mode = 'login'
let recoveryLinkVerified = false

function safeNextPath() {
  const next = new URLSearchParams(location.search).get('next') || 'account.html'
  if (next.startsWith('/') || next.includes('://') || next.split('/').includes('..')) return 'account.html'
  return /^[a-zA-Z0-9._/-]+(?:#[a-zA-Z0-9._-]+)?$/.test(next) ? next : 'account.html'
}

function setStatus(message, tone = '') {
  status.textContent = message
  status.className = 'account-status ' + tone
}

function selectedRole() {
  return form.elements.role?.value || 'client'
}

function updateRoleFields() {
  const manufacturer = selectedRole() === 'manufacturer'
  companyField.hidden = mode !== 'signup' || !manufacturer
  companyField.querySelector('input').required = mode === 'signup' && manufacturer
}

function setMode(nextMode) {
  mode = ['login', 'signup', 'forgot', 'reset'].includes(nextMode) ? nextMode : 'login'
  const signup = mode === 'signup'
  const reset = mode === 'reset'
  signupFields.hidden = !signup
  emailField.hidden = reset
  passwordField.hidden = mode === 'forgot'
  confirmField.hidden = !(signup || reset)
  tabs.hidden = mode === 'forgot' || reset
  forgotButton.hidden = mode !== 'login'
  backButton.hidden = mode !== 'forgot' && !reset
  form.elements.email.required = !reset
  form.elements.password.required = mode !== 'forgot'
  form.elements.password.autocomplete = signup || reset ? 'new-password' : 'current-password'
  form.elements.confirm_password.required = signup || reset
  form.elements.full_name.required = signup
  document.querySelector('#password-label').textContent = reset ? 'New password' : 'Password'
  document.querySelector('#auth-title').textContent = {
    login: 'Welcome back',
    signup: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode]
  document.querySelector('#auth-copy').textContent = {
    login: 'Sign in to open your account.',
    signup: 'Choose your account type, then verify your email.',
    forgot: 'Enter your account email and we will send a recovery link if an account exists.',
    reset: 'Enter a new password to finish account recovery.',
  }[mode]
  submit.firstChild.textContent = {
    login: 'Sign in ',
    signup: 'Create account ',
    forgot: 'Send recovery link ',
    reset: 'Save new password ',
  }[mode]
  document.querySelectorAll('[data-auth-mode]').forEach((button) =>
    button.setAttribute('aria-selected', String(button.dataset.authMode === mode)))
  form.elements.password.value = ''
  form.elements.confirm_password.value = ''
  updateRoleFields()
  setStatus('')
}

function validateSignup(values) {
  const fullName = values.full_name.trim()
  const companyName = values.company_name.trim()
  if (fullName.length < 1 || fullName.length > 160) {
    setStatus('Enter a full name of up to 160 characters.', 'error')
    form.elements.full_name.focus()
    return false
  }
  if (selectedRole() === 'manufacturer' && (companyName.length < 1 || companyName.length > 200)) {
    setStatus('Enter a company name of up to 200 characters.', 'error')
    form.elements.company_name.focus()
    return false
  }
  return true
}

function validatePasswordMatch(values) {
  if (values.password === values.confirm_password) return true
  setStatus('The passwords do not match.', 'error')
  form.elements.confirm_password.focus()
  return false
}

async function handleSubmit(event) {
  event.preventDefault()
  setStatus('')
  if (!form.reportValidity()) return
  const values = Object.fromEntries(new FormData(form).entries())
  if (mode === 'signup' && !validateSignup(values)) return
  if ((mode === 'signup' || mode === 'reset') && !validatePasswordMatch(values)) return

  submit.disabled = true
  setStatus({
    login: 'Signing in…',
    signup: 'Creating your account…',
    forgot: 'Sending your recovery link…',
    reset: 'Updating your password…',
  }[mode])
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
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) throw userError || new Error('We could not confirm your sign-in. Please try again.')
        location.assign(safeNextPath())
        return
      }
      form.reset()
      setMode('login')
      setStatus('Check your inbox for a confirmation link. If you already have an account, sign in or reset your password.', 'success')
    } else if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      })
      if (error) throw error
      location.assign(safeNextPath())
    } else if (mode === 'forgot') {
      const redirectTo = new URL('auth.html?mode=reset', window.location.href).href
      const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim().toLowerCase(), { redirectTo })
      if (error) throw error
      form.reset()
      setStatus('If this email has an account, a recovery link is on its way. Check your inbox and spam folder.', 'success')
    } else {
      if (!recoveryLinkVerified) {
        setMode('forgot')
        setStatus('A verified recovery link is required. Request a new one.', 'error')
        return
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setMode('forgot')
        setStatus('The recovery link has expired or could not be verified. Request a new one.', 'error')
        return
      }
      const { error } = await supabase.auth.updateUser({ password: values.password })
      if (error) throw error
      form.reset()
      location.assign('account.html')
    }
  } catch (error) {
    const message = error?.message || 'We could not complete that request. Please try again.'
    if (mode === 'forgot') {
      setStatus('We could not send the recovery email. Please wait a moment and try again.', 'error')
    } else if (mode === 'login' && /email not confirmed/i.test(message)) {
      setStatus('Confirm your email using the link we sent, then sign in.', 'error')
    } else if (mode === 'reset' && /expired|invalid|session/i.test(message)) {
      setMode('forgot')
      setStatus('The recovery link has expired or could not be verified. Request a new one.', 'error')
    } else {
      setStatus(message, 'error')
    }
  } finally {
    submit.disabled = false
  }
}

document.querySelectorAll('[data-auth-mode]').forEach((button) =>
  button.addEventListener('click', () => setMode(button.dataset.authMode)))
form.querySelectorAll('[name="role"]').forEach((input) => input.addEventListener('change', updateRoleFields))
forgotButton.addEventListener('click', () => setMode('forgot'))
backButton.addEventListener('click', () => setMode('login'))
form.addEventListener('submit', handleSubmit)

const params = new URLSearchParams(location.search)
const hashParams = new URLSearchParams(location.hash.slice(1))
const requestedMode = params.get('mode')
setMode(['signup', 'forgot'].includes(requestedMode) ? requestedMode : requestedMode === 'reset' ? 'forgot' : 'login')
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryLinkVerified = true
    setMode('reset')
    setStatus('Recovery link verified. Choose a new password.', 'success')
  }
})
if (params.get('error') || hashParams.get('error')) {
  setMode('forgot')
  setStatus('The recovery or confirmation link could not be verified. Request a new link or contact FI.', 'error')
} else {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (user && mode !== 'reset' && mode !== 'forgot') location.replace(safeNextPath())
  else if (!user && recoveryLinkVerified) {
    recoveryLinkVerified = false
    setMode('forgot')
    setStatus('The recovery link could not be verified. Request a new one.', 'error')
  } else if (requestedMode === 'reset' && !recoveryLinkVerified) {
    setStatus('A verified recovery link is required. Request a new one.', 'error')
  } else if (error && !isAuthSessionMissingError(error) && mode !== 'reset') {
    setStatus('Account status could not be checked. You can still try signing in or request a new recovery link.', 'error')
  } else if (user && mode === 'forgot') {
    form.elements.email.value = user.email || ''
  }
}
