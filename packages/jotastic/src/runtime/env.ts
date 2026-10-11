/**
 * Constante única de modo dev. Bundlers substituem `process.env.NODE_ENV` em build de produção,
 * e os ramos `if (DEV)` somem por eliminação de código morto. Sem `process` (navegador puro) = dev.
 */
export const DEV: boolean = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true
