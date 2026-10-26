;(() => {
  const input = document.getElementById('domain-search')
  const app = document.getElementById('domains-app')

  if (!(input instanceof HTMLInputElement) || !app) {
    return
  }

  const controller = new AbortController()
  const options = { signal: controller.signal }
  const updatePendingResults = () => {
    const label =
      input.value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split(/[./]/)
        .at(0) ?? ''

    app.setAttribute('data-search', input.value ? 'active' : 'idle')

    app.querySelectorAll('[data-domain-label]').forEach(labelElement => {
      labelElement.textContent = label
    })
  }
  const restoreQueryFromUrl = () => {
    const query = new URLSearchParams(location.search).get('q') ?? ''

    if (input.value !== query) {
      input.value = query
    }

    updatePendingResults()
  }
  const replaceSearchUrl = () => {
    const url = new URL(location.href)

    if (input.value) {
      url.searchParams.set('q', input.value)
    } else {
      url.searchParams.delete('q')
    }

    history.replaceState(history.state, '', url)
    updatePendingResults()
  }

  if (input.value !== input.defaultValue) {
    replaceSearchUrl()
  } else {
    restoreQueryFromUrl()
  }

  input.addEventListener('input', replaceSearchUrl, options)
  input.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault()
        input.value = ''
        replaceSearchUrl()
      }
    },
    options,
  )
  input.form?.addEventListener(
    'submit',
    event => event.preventDefault(),
    options,
  )
  app.querySelector('.clear-search')?.addEventListener(
    'click',
    () => {
      input.value = ''
      replaceSearchUrl()
      input.focus({ preventScroll: true })
    },
    options,
  )
  window.addEventListener('popstate', restoreQueryFromUrl, options)
  document.addEventListener('domains:ready', () => controller.abort(), {
    once: true,
  })

  const desktopMediaQuery = '(min-width: 701px)'

  if (
    window.matchMedia(desktopMediaQuery).matches &&
    document.activeElement === document.body
  ) {
    input.focus({ preventScroll: true })
  }
})()
