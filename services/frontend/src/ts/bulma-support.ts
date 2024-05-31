function enableDropdownSupport () {
  document.querySelectorAll('.dropdown').forEach((dropdown) => {
    dropdown.querySelector('.dropdown-trigger').addEventListener('click', (event) => {
      event.preventDefault()
      dropdown.classList.toggle('is-active')
    })
  })
}

export function enableBulmaSupport () {
  enableDropdownSupport()
}
