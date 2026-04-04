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
  currency: (value: string | number) => `R ${Number(value).toFixed(2)}`,
}
