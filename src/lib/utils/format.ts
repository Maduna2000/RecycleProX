const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  year: 'numeric', month: 'short', day: '2-digit',
})

const datetimeFormatter = new Intl.DateTimeFormat('en-ZA', {
  year: 'numeric', month: 'short', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

export const format = {
  date: (value: string | Date) => dateFormatter.format(new Date(value)),
  datetime: (value: string | Date) => datetimeFormatter.format(new Date(value)),
  // Defaults to 'R' only for callers that haven't been updated to pass the
  // tenant's configured symbol yet (see useSystemCurrency) — never hardcode
  // a call site to a specific currency going forward.
  currency: (value: string | number, symbol = 'R') => `${symbol} ${Number(value).toFixed(2)}`,
}
