const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const dist = path.join(__dirname, '..', 'dist')
const authJs = fs.readFileSync(path.join(dist, 'auth.js'), 'utf8')
const authHtml = fs.readFileSync(path.join(dist, 'auth.html'), 'utf8')
const accountJs = fs.readFileSync(path.join(dist, 'account.js'), 'utf8')
const accountHtml = fs.readFileSync(path.join(dist, 'account.html'), 'utf8')

function loadFunction(source, start, end, name, globals = {}) {
  const first = source.indexOf(start)
  const last = source.indexOf(end, first)
  assert.ok(first >= 0 && last > first, name + ' can be isolated')
  const context = vm.createContext({...globals})
  vm.runInContext(source.slice(first, last) + '\nthis.subject = ' + name, context)
  return context.subject
}

function form(fullName, companyName) {
  const focused = []
  return {
    focused,
    elements: {
      full_name: {value: fullName, focus: () => focused.push('full_name')},
      company_name: {value: companyName, focus: () => focused.push('company_name')},
    },
  }
}

test('account validates editable names and returns only display fields', () => {
  const messages = []
  const globals = {profile: {role: 'manufacturer'}, setStatus: (...args) => messages.push(args)}
  const validate = loadFunction(accountJs, 'function validatedProfileFields(', '\nasync function saveProfile(', 'validatedProfileFields', globals)
  const valid = validate(form('  Ada Lovelace  ', '  Example Works  '))
  assert.equal(valid.full_name, 'Ada Lovelace')
  assert.equal(valid.company_name, 'Example Works')
  assert.deepEqual(Object.keys(valid).sort(), ['company_name', 'full_name'])
  assert.equal(validate(form('   ', 'Example Works')), null)
  assert.equal(validate(form('Ada Lovelace', '   ')), null)
  assert.equal(validate(form('x'.repeat(161), 'Example Works')), null)
  assert.equal(validate(form('Ada Lovelace', 'x'.repeat(201))), null)
  assert.ok(messages.some((item) => item[0] === '#profile-status' && item[2] === 'error'))

  globals.profile.role = 'client'
  const clientValidate = loadFunction(accountJs, 'function validatedProfileFields(', '\nasync function saveProfile(', 'validatedProfileFields', globals)
  assert.equal(clientValidate(form('Ada Lovelace', '')).company_name, null)
})

test('account uses a validated Auth user and never sends a role in profile update', () => {
  assert.match(accountJs, /supabase\.auth\.getUser\(\)/)
  assert.doesNotMatch(accountJs, /supabase\.auth\.getSession\(\)|user_metadata/)
  assert.match(accountJs, /isAuthSessionMissingError/)
  assert.match(accountJs, /\.from\('fi_user_profiles'\)[\s\S]*?\.update\(\{\.\.\.fields, updated_at:/)
  assert.match(accountJs, /\.eq\('user_id', currentUser\.id\)/)
  assert.match(accountHtml, /id="profile-form"/)
  assert.match(accountHtml, /name="full_name"[^>]*maxlength="160" required/)
  assert.match(accountHtml, /name="company_name"[^>]*maxlength="200"/)
});

test('auth page supports reset request, recovery callback and confirmed signup', () => {
  assert.match(authHtml, /id="forgot-password"/)
  assert.match(authHtml, /id="back-to-signin"/)
  assert.match(authJs, /resetPasswordForEmail\([^,]+, \{ redirectTo \}\)/)
  assert.match(authJs, /new URL\('auth\.html\?mode=reset'/)
  assert.match(authJs, /event === 'PASSWORD_RECOVERY'/)
  assert.match(authJs, /supabase\.auth\.updateUser\(\{ password: values\.password \}\)/)
  assert.match(authJs, /if \(data\.session\)/)
  assert.match(authJs, /Check your inbox for a confirmation link/)
  assert.match(authJs, /If this email has an account/)
  assert.match(authJs, /supabase\.auth\.getUser\(\)/)
  assert.doesNotMatch(authJs, /supabase\.auth\.getSession\(\)/)
  assert.match(authJs, /isAuthSessionMissingError/)
  assert.match(authHtml, /Email setup is in progress/);
  assert.match(authHtml, /Existing users can still sign in/);
})

test('signed-out account redirects while a real Auth network failure stays visible', async () => {
  const redirects = []
  const messages = []
  const makeBoot = (error) => loadFunction(
    accountJs, 'async function boot() {', "\n$('#sign-out')", 'boot', {
      supabase: {auth: {getUser: async () => ({data: {user: null}, error})}},
      isAuthSessionMissingError: (candidate) => candidate?.name === 'AuthSessionMissingError',
      location: {replace: (url) => redirects.push(url)},
      setStatus: (...args) => messages.push(args),
    })

  await makeBoot({name: 'AuthSessionMissingError'})()
  assert.deepEqual(redirects, ['auth.html?next=account.html'])
  assert.equal(messages.length, 0)

  redirects.length = 0
  await makeBoot({name: 'AuthRetryableFetchError'})()
  assert.equal(redirects.length, 0)
  assert.match(messages.at(-1)[1], /could not verify your account/)
})

test('signed-out auth form stays clean, but network failures and unverified reset URLs show errors', async () => {
  async function runAuthStartup({search = '', user = null, error = null, recoveryEvent = false}) {
    const messages = []
    const modes = []
    const redirects = []
    let listener
    const source = authJs.slice(authJs.indexOf('const params = new URLSearchParams(location.search)'))
    const context = vm.createContext({
      URLSearchParams,
      location: {search, hash: '', replace: (url) => redirects.push(url)},
      supabase: {auth: {
        onAuthStateChange: (callback) => {listener = callback},
        getUser: async () => {
          if (recoveryEvent) listener('PASSWORD_RECOVERY')
          return {data: {user}, error}
        },
      }},
      isAuthSessionMissingError: (candidate) => candidate?.name === 'AuthSessionMissingError',
      setStatus: (...args) => messages.push(args),
      safeNextPath: () => 'account.html',
      form: {elements: {email: {value: ''}}},
      modes,
    })
    vm.runInContext(
      'let mode = "login"; let recoveryLinkVerified = false;' +
      'function setMode(next) { mode = next; modes.push(next); }' +
      'this.runStartup = async function () {\n' + source + '\n}',
      context,
    )
    await context.runStartup()
    return {messages, modes, redirects}
  }

  const signedOut = await runAuthStartup({error: {name: 'AuthSessionMissingError'}})
  assert.deepEqual(signedOut.modes, ['login'])
  assert.equal(signedOut.messages.length, 0)
  assert.equal(signedOut.redirects.length, 0)

  const failed = await runAuthStartup({error: {name: 'AuthRetryableFetchError'}})
  assert.match(failed.messages.at(-1)[0], /Account status could not be checked/)

  const forgedReset = await runAuthStartup({search: '?mode=reset', user: {id: 'already-signed-in'}})
  assert.deepEqual(forgedReset.modes, ['forgot'])
  assert.match(forgedReset.messages.at(-1)[0], /verified recovery link is required/)
  assert.equal(forgedReset.redirects.length, 0)

  const confirmedReset = await runAuthStartup({search: '?mode=reset', user: {id: 'recovered'}, recoveryEvent: true})
  assert.deepEqual(confirmedReset.modes, ['forgot', 'reset'])
  assert.match(confirmedReset.messages.at(-1)[0], /Recovery link verified/)
})

test('password change refuses a signed-in reset URL without the recovery event', async () => {
  let identityCalls = 0
  let updateCalls = 0
  const statuses = []
  const redirect = []
  const base = {
    mode: 'reset',
    form: {reportValidity: () => true, reset: () => {}},
    FormData: class {entries() {return [['password', 'long-password'], ['confirm_password', 'long-password']][Symbol.iterator]()}},
    validatePasswordMatch: () => true,
    submit: {disabled: false},
    setStatus: (...args) => statuses.push(args),
    setMode: () => {},
    location: {assign: (url) => redirect.push(url)},
    supabase: {auth: {
      getUser: async () => {identityCalls++; return {data: {user: {id: 'user'}}, error: null}},
      updateUser: async () => {updateCalls++; return {error: null}},
    }},
  }
  const handleUnverified = loadFunction(
    authJs, 'async function handleSubmit(event) {', "\ndocument.querySelectorAll('[data-auth-mode]')",
    'handleSubmit', {...base, recoveryLinkVerified: false},
  )
  await handleUnverified({preventDefault: () => {}})
  assert.equal(identityCalls, 0)
  assert.equal(updateCalls, 0)
  assert.match(statuses.at(-1)[0], /verified recovery link is required/)

  const handleVerified = loadFunction(
    authJs, 'async function handleSubmit(event) {', "\ndocument.querySelectorAll('[data-auth-mode]')",
    'handleSubmit', {...base, recoveryLinkVerified: true},
  )
  await handleVerified({preventDefault: () => {}})
  assert.equal(identityCalls, 1)
  assert.equal(updateCalls, 1)
  assert.deepEqual(redirect, ['account.html'])
})

test('payment panel is read-only, separates requests and handles minor currency units', () => {
  const paymentAmount = loadFunction(accountJs, 'function paymentAmount(', '\nfunction renderPayments(', 'paymentAmount', {Intl, Number})
  assert.equal(paymentAmount({currency: 'AUD', amount_minor: 12550}), '$125.50')
  assert.match(paymentAmount({currency: 'JPY', amount_minor: 12550}), /12,550/)
  assert.equal(paymentAmount({currency: 'AUD', amount_minor: -1}), 'Amount unavailable')
  assert.match(accountJs, /\.from\('fi_account_payments'\)/)
  assert.match(accountJs, /\.eq\('customer_user_id', currentUser\.id\)/)
  assert.match(accountJs, /Payments are unavailable right now/)
  assert.match(accountJs, /No payments yet\./)
  assert.match(accountJs, /Payment requests will appear here after FI confirms your quote\./)
  assert.match(accountHtml, /id="payments-dashboard"/)
  assert.doesNotMatch(accountHtml, /id="payments-dashboard"[\s\S]*?<\/section>[\s\S]*?(?:Buy now|Pay now)/i)
})
