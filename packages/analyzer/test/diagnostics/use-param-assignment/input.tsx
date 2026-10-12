import { watch } from 'jotastic'

export function useTitle(title: string) {
  watch(() => {
    title = title.trim()
    document.title = title
  })
}
