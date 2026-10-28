export const observeSearchPresentationTiming = () => {
  let sequence = 0
  let pending:
    | { label: string; startedAtMillis: number; sequence: number }
    | undefined

  document.addEventListener(
    'input',
    event => {
      if (
        event.target instanceof HTMLInputElement &&
        event.target.id === 'domain-search'
      ) {
        sequence += 1
        pending = {
          label: event.target.value,
          startedAtMillis: performance.now(),
          sequence,
        }
      }
    },
    true,
  )

  const observer = new MutationObserver(() => {
    if (pending === undefined || pending.label === '') {
      return
    }

    const cards = Array.from(document.querySelectorAll('.domain-card'))
    if (
      cards.length !== 4 ||
      cards.some(
        card =>
          !card
            .querySelector('h3')
            ?.textContent?.startsWith(`${pending?.label}.`) ||
          card.querySelector('.skeleton') !== null,
      )
    ) {
      return
    }

    const sample = pending
    pending = undefined
    performance.measure('domains-input-to-results', {
      start: sample.startedAtMillis,
      end: performance.now(),
      detail: { sequence: sample.sequence },
    })
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        performance.measure('domains-input-to-frame', {
          start: sample.startedAtMillis,
          end: performance.now(),
          detail: { sequence: sample.sequence },
        })
      }),
    )
  })
  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'aria-hidden'],
  })
}
