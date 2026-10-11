// Tipos mínimos para os testes (os .js ficam fora do tsc).
export declare function useFetch<T = unknown>(
  url: () => string,
  init: () => RequestInit | undefined,
): { data: T | null; error: Error | null; readonly loading: boolean }
export declare function useMediaQuery(query: () => string): { matches: boolean }
export declare function useClickOutside(el: () => Element | null | undefined, handler: () => () => void): void
