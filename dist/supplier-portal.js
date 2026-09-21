import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'

const SUPABASE_URL = 'https://dszagdjnymxalpwamjyh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx'])
const REVIEW_STATUSES = ['not_submitted', 'in_review', 'changes_requested', 'approved', 'rejected']

const state = {
  language: 'en',
  session: null,
  isTeam: false,
  supplier: null,
  profileReview: null,
  products: [],
  productReviews: new Map(),
  assets: [],
  teamProfiles: [],
  teamProfileReviews: new Map(),
  teamProducts: [],
  teamProductReviews: new Map(),
}

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const t = (english, chinese) => state.language === 'zh' ? chinese : english
const text = (value) => String(value ?? '')
const clean = (value) => text(value).trim() || null
const now = () => new Date().toISOString()

function message(id, content = '', tone = '') {
  const node = $(`#${id}`)
  node.textContent = content
  node.className = `status ${tone}`.trim()
}

function reviewLabel(status) {
  return {
    draft: t('Draft', '草稿'),
    submitted: t('Submitted to FI', '已提交给 FI'),
    not_submitted: t('Not submitted', '尚未提交'),
    in_review: t('In FI review', 'FI 审核中'),
    changes_requested: t('Changes requested', '需要修改'),
    approved: t('Approved by FI', '已获 FI 批准'),
    rejected: t('Not approved', '未获批准'),
  }[status] || t('Not submitted', '尚未提交')
}

function categoryLabel(category) {
  return {
    stairs: t('Stairs', '楼梯'),
    facade: t('Facade', '幕墙/立面'),
    metalwork: t('Metalwork', '金属制品'),
    precast: t('Precast', '预制构件'),
    joinery: t('Joinery', '木作/细木工'),
    other: t('Other', '其他'),
  }[category] || text(category)
}

function displayReview(review, submissionState) {
  if (review && review.status !== 'not_submitted') return review.status
  return submissionState === 'submitted' ? 'submitted' : 'draft'
}

function badge(node, status) {
  node.textContent = reviewLabel(status)
  node.className = `badge ${status}`
}

function applyLanguage() {
  const profileForm = $('#profile-form')
  const profileDraft = state.supplier && !$('#supplier-workspace').hidden
    ? Object.fromEntries(new FormData(profileForm).entries())
    : null
  document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en'
  $$('[data-en]').forEach((node) => { node.textContent = state.language === 'zh' ? node.dataset.zh : node.dataset.en })
  $$('[data-language]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.language === state.language)))
  if (state.supplier) renderSupplier()
  if (profileDraft) {
    Object.entries(profileDraft).forEach(([key, value]) => {
      const field = profileForm.elements.namedItem(key)
      if (field) field.value = value
    })
  }
  if (state.isTeam) renderTeam()
}

async function unwrap(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

function setAuthenticatedView(kind) {
  $('#auth-panel').hidden = kind !== 'none'
  $('#supplier-workspace').hidden = kind !== 'supplier'
  $('#team-workspace').hidden = kind !== 'team'
}

async function requestMagicLink(event) {
  event.preventDefault()
  const form = $('#magic-link-form')
  if (!form.reportValidity()) return
  const email = $('#auth-email').value.trim().toLowerCase()
  message('auth-status', t('Sending your secure link…', '正在发送安全链接…'))
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  })
  if (error) {
    message('auth-status', t('This email needs an FI invitation before it can sign in.', '此邮箱需要先获得 FI 邀请才能登录。'), 'error')
    return
  }
  message('auth-status', t('Check your inbox for the secure sign-in link.', '请查收邮箱中的安全登录链接。'), 'success')
}

async function signOut() {
  await supabase.auth.signOut()
  state.session = null
  state.supplier = null
  state.isTeam = false
  setAuthenticatedView('none')
  message('auth-status', '')
}

async function findTeamMembership(email) {
  const { data, error } = await supabase.from('fi_team_members').select('email, role').ilike('email', email).maybeSingle()
  if (error) throw error
  return data
}

async function bootWorkspace(session) {
  state.session = session
  if (!session?.user?.email) {
    setAuthenticatedView('none')
    return
  }

  try {
    const teamMember = await findTeamMembership(session.user.email)
    if (teamMember) {
      state.isTeam = true
      state.supplier = null
      setAuthenticatedView('team')
      await loadTeamWorkspace()
      return
    }

    state.isTeam = false
    const memberships = await unwrap(supabase
      .from('fi_supplier_memberships')
      .select('supplier_id, email, role')
      .ilike('email', session.user.email)
      .order('created_at', { ascending: true }))
    if (!memberships?.length) {
      setAuthenticatedView('none')
      message('auth-status', t('Your sign-in works, but this email is not connected to a supplier workspace yet. Contact FI.', '您的登录已成功，但此邮箱尚未关联供应商工作区。请联系 FI。'), 'error')
      return
    }
    await loadSupplierWorkspace(memberships[0].supplier_id)
    setAuthenticatedView('supplier')
  } catch (error) {
    console.error(error)
    setAuthenticatedView('none')
    message('auth-status', t('We could not open the workspace. Please try again.', '无法打开工作区，请稍后重试。'), 'error')
  }
}

async function loadSupplierWorkspace(supplierId) {
  const profile = await unwrap(supabase.from('fi_supplier_profiles').select('*').eq('id', supplierId).single())
  const profileReview = await unwrap(supabase.from('fi_supplier_profile_reviews').select('*').eq('supplier_id', supplierId).maybeSingle())
  const products = await unwrap(supabase.from('fi_supplier_catalogue_items').select('*').eq('supplier_id', supplierId).order('updated_at', { ascending: false }))
  const productIds = products.map((product) => product.id)
  const reviews = productIds.length
    ? await unwrap(supabase.from('fi_supplier_catalogue_reviews').select('*').in('catalogue_item_id', productIds))
    : []
  const assets = await unwrap(supabase.from('fi_supplier_catalogue_assets').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false }))

  state.supplier = profile
  state.profileReview = profileReview
  state.products = products
  state.productReviews = new Map(reviews.map((review) => [review.catalogue_item_id, review]))
  state.assets = assets
  renderSupplier()
}

function fillForm(form, row) {
  if (!form || !row) return
  Object.entries(row).forEach(([key, value]) => {
    const field = form.elements.namedItem(key)
    if (field && field.type !== 'hidden') field.value = value ?? ''
  })
}

function renderSupplier() {
  if (!state.supplier) return
  const profile = state.supplier
  $('#supplier-name').textContent = profile.trading_name || profile.legal_name
  const profileStatus = displayReview(state.profileReview, profile.supplier_submission_state)
  $('#supplier-review-summary').textContent = state.profileReview?.review_note || reviewLabel(profileStatus)
  badge($('#profile-review-badge'), profileStatus)
  fillForm($('#profile-form'), profile)
  renderCatalogueList()
}

function productAssets(productId) {
  return state.assets.filter((asset) => asset.catalogue_item_id === productId)
}

function renderCatalogueList() {
  const list = $('#catalogue-list')
  list.replaceChildren()
  if (!state.products.length) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = t('No products have been added. Start with the item you would most like FI to review.', '尚未添加产品。请从最希望由 FI 审核的产品开始。')
    list.append(empty)
    return
  }
  state.products.forEach((product) => {
    const review = state.productReviews.get(product.id)
    const status = displayReview(review, product.supplier_submission_state)
    const card = document.createElement('article')
    card.className = 'product-card'
    const statusNode = document.createElement('span')
    badge(statusNode, status)
    const heading = document.createElement('h3')
    heading.textContent = product.product_name
    const description = document.createElement('p')
    description.textContent = `${categoryLabel(product.category)} · ${product.material}`
    const meta = document.createElement('p')
    meta.className = 'product-meta'
    const assetCount = productAssets(product.id).length
    meta.textContent = `${product.product_code || t('No product code', '无产品编号')} · ${assetCount} ${assetCount === 1 ? t('file', '个文件') : t('files', '个文件')}`
    const footer = document.createElement('footer')
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'text-button'
    edit.textContent = t('Open and edit', '打开并编辑')
    edit.addEventListener('click', () => openProduct(product.id))
    footer.append(edit, statusNode)
    card.append(heading, description, meta, footer)
    list.append(card)
  })
}

function profilePayload() {
  const form = $('#profile-form')
  const values = Object.fromEntries(new FormData(form).entries())
  return {
    legal_name: clean(values.legal_name),
    trading_name: clean(values.trading_name),
    country: clean(values.country),
    province_or_state: clean(values.province_or_state),
    city: clean(values.city),
    website: clean(values.website),
    contact_name: clean(values.contact_name),
    contact_email: clean(values.contact_email),
    capabilities: clean(values.capabilities),
    certifications: clean(values.certifications),
    typical_lead_time_days: numberOrNull(values.typical_lead_time_days),
    moq_notes: clean(values.moq_notes),
    export_markets: clean(values.export_markets),
    updated_at: now(),
  }
}

function numberOrNull(value) {
  const candidate = clean(value)
  return candidate === null ? null : Number(candidate)
}

async function saveProfile(event, quiet = false) {
  event?.preventDefault()
  const form = $('#profile-form')
  if (!form.reportValidity()) return false
  message('profile-status', quiet ? '' : t('Saving profile…', '正在保存资料…'))
  try {
    const updated = await unwrap(supabase
      .from('fi_supplier_profiles')
      .update(profilePayload())
      .eq('id', state.supplier.id)
      .select('*')
      .single())
    state.supplier = updated
    renderSupplier()
    if (!quiet) message('profile-status', t('Profile saved.', '资料已保存。'), 'success')
    return true
  } catch (error) {
    console.error(error)
    message('profile-status', t('We could not save the profile. Please try again.', '无法保存资料，请稍后重试。'), 'error')
    return false
  }
}

async function submitProfile() {
  const saved = await saveProfile(null, true)
  if (!saved) return
  message('profile-status', t('Submitting profile to FI…', '正在提交资料给 FI…'))
  try {
    const updated = await unwrap(supabase
      .from('fi_supplier_profiles')
      .update({ supplier_submission_state: 'submitted', submitted_at: now(), updated_at: now() })
      .eq('id', state.supplier.id)
      .select('*')
      .single())
    state.supplier = updated
    renderSupplier()
    message('profile-status', t('Profile submitted to FI for review.', '资料已提交给 FI 审核。'), 'success')
  } catch (error) {
    console.error(error)
    message('profile-status', t('We could not submit the profile. Please try again.', '无法提交资料，请稍后重试。'), 'error')
  }
}

function productPayload() {
  const form = $('#product-form')
  const values = Object.fromEntries(new FormData(form).entries())
  return {
    product_name: clean(values.product_name),
    product_code: clean(values.product_code),
    category: values.category,
    material: clean(values.material),
    description: clean(values.description),
    specifications: clean(values.specifications),
    minimum_order_quantity: numberOrNull(values.minimum_order_quantity),
    quantity_unit: clean(values.quantity_unit),
    lead_time_days: numberOrNull(values.lead_time_days),
    export_markets: clean(values.export_markets),
    updated_at: now(),
  }
}

function resetProductForm() {
  const form = $('#product-form')
  form.reset()
  form.elements.product_id.value = ''
  $('#product-form-title').textContent = t('New product', '添加产品')
  badge($('#product-review-badge'), 'draft')
  $('#product-detail').hidden = true
  $('#asset-list').replaceChildren()
  message('product-status', '')
  message('asset-status', '')
}

function openProduct(productId) {
  const product = state.products.find((item) => item.id === productId)
  if (!product) return
  const form = $('#product-form')
  form.hidden = false
  form.reset()
  fillForm(form, product)
  form.elements.product_id.value = product.id
  $('#product-form-title').textContent = product.product_name
  const review = state.productReviews.get(product.id)
  badge($('#product-review-badge'), displayReview(review, product.supplier_submission_state))
  $('#product-detail').hidden = false
  renderAssetList(product.id)
  form.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function saveProduct(event, quiet = false) {
  event?.preventDefault()
  const form = $('#product-form')
  if (!form.reportValidity()) return null
  const productId = form.elements.product_id.value
  message('product-status', quiet ? '' : t('Saving product…', '正在保存产品…'))
  try {
    const payload = productPayload()
    let item
    if (productId) {
      item = await unwrap(supabase.from('fi_supplier_catalogue_items').update(payload).eq('id', productId).select('*').single())
    } else {
      item = await unwrap(supabase.from('fi_supplier_catalogue_items').insert({ ...payload, supplier_id: state.supplier.id, supplier_submission_state: 'draft' }).select('*').single())
    }
    await loadSupplierWorkspace(state.supplier.id)
    openProduct(item.id)
    if (!quiet) message('product-status', t('Product saved as a draft.', '产品草稿已保存。'), 'success')
    return item
  } catch (error) {
    console.error(error)
    message('product-status', t('We could not save this product. Please try again.', '无法保存此产品，请稍后重试。'), 'error')
    return null
  }
}

async function submitProduct() {
  const item = await saveProduct(null, true)
  if (!item) return
  message('product-status', t('Submitting product to FI…', '正在提交产品给 FI…'))
  try {
    await unwrap(supabase
      .from('fi_supplier_catalogue_items')
      .update({ supplier_submission_state: 'submitted', submitted_at: now(), updated_at: now() })
      .eq('id', item.id))
    await loadSupplierWorkspace(state.supplier.id)
    openProduct(item.id)
    message('product-status', t('Product submitted to FI for review.', '产品已提交给 FI 审核。'), 'success')
  } catch (error) {
    console.error(error)
    message('product-status', t('We could not submit this product. Please try again.', '无法提交此产品，请稍后重试。'), 'error')
  }
}

function extension(filename) {
  return text(filename).toLowerCase().split('.').pop()
}

function safeFilename(filename) {
  const base = text(filename).normalize('NFKC').split(/[\\/]/).pop() || 'file'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 170)
}

function validateAsset(file) {
  if (file.size > MAX_FILE_BYTES) return t(`${file.name} is larger than 10 MB.`, `${file.name} 超过 10 MB。`)
  if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(extension(file.name))) return t(`${file.name} is not an accepted file type.`, `${file.name} 的文件类型不受支持。`)
  return ''
}

async function uploadAssets(event) {
  event.preventDefault()
  const productId = $('#product-form').elements.product_id.value
  const files = [...$('#asset-files').files]
  if (!productId) {
    message('asset-status', t('Save the product before uploading files.', '上传文件前请先保存产品。'), 'error')
    return
  }
  if (!files.length) {
    message('asset-status', t('Choose at least one file.', '请至少选择一个文件。'), 'error')
    return
  }
  const problem = files.map(validateAsset).find(Boolean)
  if (problem) {
    message('asset-status', problem, 'error')
    return
  }
  const type = $('#asset-type').value
  message('asset-status', t('Uploading private files…', '正在上传私密文件…'))
  try {
    for (const file of files) {
      const path = `${state.supplier.id}/${productId}/${crypto.randomUUID()}-${safeFilename(file.name)}`
      const { error: uploadError } = await supabase.storage.from('fi-supplier-assets').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream', cacheControl: '3600' })
      if (uploadError) throw uploadError
      try {
        await unwrap(supabase.from('fi_supplier_catalogue_assets').insert({
          supplier_id: state.supplier.id,
          catalogue_item_id: productId,
          asset_type: type,
          storage_path: path,
          original_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        }))
      } catch (recordError) {
        await supabase.storage.from('fi-supplier-assets').remove([path])
        throw recordError
      }
    }
    $('#asset-files').value = ''
    await loadSupplierWorkspace(state.supplier.id)
    openProduct(productId)
    message('asset-status', t('Files uploaded privately.', '文件已私密上传。'), 'success')
  } catch (error) {
    console.error(error)
    message('asset-status', t('We could not upload the selected files. Please try again.', '无法上传所选文件，请稍后重试。'), 'error')
  }
}

function renderAssetList(productId) {
  const list = $('#asset-list')
  list.replaceChildren()
  const assets = productAssets(productId)
  if (!assets.length) {
    const item = document.createElement('li')
    item.textContent = t('No private files attached yet.', '尚未添加私密文件。')
    list.append(item)
    return
  }
  assets.forEach((asset) => {
    const item = document.createElement('li')
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'text-button'
    open.textContent = asset.original_name
    open.addEventListener('click', () => openPrivateAsset(asset, open))
    const kind = document.createElement('span')
    kind.textContent = asset.asset_type
    item.append(open, kind)
    list.append(item)
  })
}

async function openPrivateAsset(asset, button) {
  button.disabled = true
  const { data, error } = await supabase.storage.from('fi-supplier-assets').createSignedUrl(asset.storage_path, 300)
  button.disabled = false
  if (error) {
    message('asset-status', t('We could not open this private file.', '无法打开此私密文件。'), 'error')
    return
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

async function loadTeamWorkspace() {
  const [profiles, profileReviews, products, productReviews] = await Promise.all([
    unwrap(supabase.from('fi_supplier_profiles').select('*').order('updated_at', { ascending: false })),
    unwrap(supabase.from('fi_supplier_profile_reviews').select('*')),
    unwrap(supabase.from('fi_supplier_catalogue_items').select('*').order('updated_at', { ascending: false })),
    unwrap(supabase.from('fi_supplier_catalogue_reviews').select('*')),
  ])
  state.teamProfiles = profiles
  state.teamProfileReviews = new Map(profileReviews.map((review) => [review.supplier_id, review]))
  state.teamProducts = products
  state.teamProductReviews = new Map(productReviews.map((review) => [review.catalogue_item_id, review]))
  renderTeam()
}

function renderTeam() {
  renderTeamProfiles()
  renderTeamProducts()
}

function reviewOptions(selected) {
  return REVIEW_STATUSES.map((status) => {
    const option = document.createElement('option')
    option.value = status
    option.textContent = reviewLabel(status)
    option.selected = status === selected
    return option
  })
}

function reviewCard({ title, description, meta, status, note, onSave }) {
  const card = document.createElement('article')
  card.className = 'review-card'
  const badgeNode = document.createElement('span')
  badge(badgeNode, status)
  const heading = document.createElement('h3')
  heading.textContent = title
  const copy = document.createElement('p')
  copy.textContent = description
  const metaNode = document.createElement('p')
  metaNode.className = 'review-meta'
  metaNode.textContent = meta
  const form = document.createElement('form')
  const statusSelect = document.createElement('select')
  statusSelect.setAttribute('aria-label', t('FI review status', 'FI 审核状态'))
  reviewOptions(status).forEach((option) => statusSelect.append(option))
  const noteField = document.createElement('textarea')
  noteField.placeholder = t('Optional note to supplier', '给供应商的可选备注')
  noteField.maxLength = 4000
  noteField.value = note || ''
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'button secondary'
  save.textContent = t('Save FI review', '保存 FI 审核')
  const result = document.createElement('p')
  result.className = 'status'
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    save.disabled = true
    result.textContent = t('Saving review…', '正在保存审核…')
    try {
      await onSave(statusSelect.value, noteField.value)
      result.textContent = t('Review saved.', '审核已保存。')
      result.className = 'status success'
    } catch (error) {
      console.error(error)
      result.textContent = t('Review could not be saved.', '无法保存审核。')
      result.className = 'status error'
    } finally {
      save.disabled = false
    }
  })
  form.append(statusSelect, noteField, save, result)
  card.append(badgeNode, heading, copy, metaNode, form)
  return card
}

function renderTeamProfiles() {
  const list = $('#team-profile-list')
  list.replaceChildren()
  if (!state.teamProfiles.length) {
    list.append(emptyNode(t('No supplier companies yet.', '尚无供应商公司。')))
    return
  }
  state.teamProfiles.forEach((profile) => {
    const review = state.teamProfileReviews.get(profile.id)
    const status = displayReview(review, profile.supplier_submission_state)
    const meta = [profile.country, profile.city, profile.contact_email].filter(Boolean).join(' · ') || t('Profile not yet completed', '资料尚未完成')
    list.append(reviewCard({
      title: profile.trading_name || profile.legal_name,
      description: profile.capabilities || t('No manufacturing capabilities supplied yet.', '尚未提供制造能力。'),
      meta,
      status,
      note: review?.review_note,
      onSave: async (nextStatus, reviewNote) => {
        await unwrap(supabase.from('fi_supplier_profile_reviews').upsert({
          supplier_id: profile.id,
          status: nextStatus,
          review_note: clean(reviewNote),
          reviewed_by: state.session.user.email,
          reviewed_at: now(),
        }, { onConflict: 'supplier_id' }))
        await loadTeamWorkspace()
      },
    }))
  })
}

function renderTeamProducts() {
  const list = $('#team-product-list')
  list.replaceChildren()
  const profileNames = new Map(state.teamProfiles.map((profile) => [profile.id, profile.trading_name || profile.legal_name]))
  const submitted = state.teamProducts.filter((product) => product.supplier_submission_state === 'submitted' || state.teamProductReviews.has(product.id))
  if (!submitted.length) {
    list.append(emptyNode(t('No catalogue products have been submitted for review.', '尚未有提交审核的产品。')))
    return
  }
  submitted.forEach((product) => {
    const review = state.teamProductReviews.get(product.id)
    const status = displayReview(review, product.supplier_submission_state)
    const meta = [profileNames.get(product.supplier_id), categoryLabel(product.category), product.material, product.product_code].filter(Boolean).join(' · ')
    list.append(reviewCard({
      title: product.product_name,
      description: product.specifications || product.description || t('No description supplied yet.', '尚未提供产品描述。'),
      meta,
      status,
      note: review?.review_note,
      onSave: async (nextStatus, reviewNote) => {
        await unwrap(supabase.from('fi_supplier_catalogue_reviews').upsert({
          catalogue_item_id: product.id,
          status: nextStatus,
          review_note: clean(reviewNote),
          reviewed_by: state.session.user.email,
          reviewed_at: now(),
        }, { onConflict: 'catalogue_item_id' }))
        await loadTeamWorkspace()
      },
    }))
  })
}

function emptyNode(content) {
  const node = document.createElement('p')
  node.className = 'empty'
  node.textContent = content
  return node
}

async function createSupplierRecord(event) {
  event.preventDefault()
  const form = $('#team-supplier-form')
  if (!form.reportValidity()) return
  const values = Object.fromEntries(new FormData(form).entries())
  message('team-supplier-status', t('Creating supplier record…', '正在创建供应商记录…'))
  let profile
  try {
    profile = await unwrap(supabase.from('fi_supplier_profiles').insert({
      legal_name: clean(values.legal_name),
      country: clean(values.country),
      contact_email: clean(values.email),
      supplier_submission_state: 'draft',
      updated_at: now(),
    }).select('*').single())
    await unwrap(supabase.from('fi_supplier_memberships').insert({
      supplier_id: profile.id,
      email: values.email.trim().toLowerCase(),
      role: 'owner',
    }))
    form.reset()
    form.elements.country.value = 'China'
    message('team-supplier-status', t('Supplier record created. Next: send that email an Auth invitation in Supabase Dashboard.', '供应商记录已创建。下一步：在 Supabase Dashboard 向该邮箱发送 Auth 邀请。'), 'success')
    await loadTeamWorkspace()
  } catch (error) {
    console.error(error)
    if (profile?.id) await supabase.from('fi_supplier_profiles').delete().eq('id', profile.id)
    message('team-supplier-status', t('We could not create this supplier record. Check that the email is not already assigned.', '无法创建此供应商记录。请检查该邮箱是否已被分配。'), 'error')
  }
}

$('#magic-link-form').addEventListener('submit', requestMagicLink)
$('#profile-form').addEventListener('submit', saveProfile)
$('#submit-profile').addEventListener('click', submitProfile)
$('#new-product').addEventListener('click', () => {
  $('#product-form').hidden = false
  resetProductForm()
  $('#product-form').scrollIntoView({ behavior: 'smooth', block: 'start' })
})
$('#product-form').addEventListener('submit', saveProduct)
$('#submit-product').addEventListener('click', submitProduct)
$('#asset-form').addEventListener('submit', uploadAssets)
$('#team-supplier-form').addEventListener('submit', createSupplierRecord)
$$('[data-action="sign-out"]').forEach((button) => button.addEventListener('click', signOut))
$$('[data-language]').forEach((button) => button.addEventListener('click', () => { state.language = button.dataset.language; applyLanguage() }))

supabase.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => { void bootWorkspace(session) }, 0)
})
applyLanguage()
const { data: { session } } = await supabase.auth.getSession()
await bootWorkspace(session)
