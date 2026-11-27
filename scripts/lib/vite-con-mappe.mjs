// Vite con le mappe dei sorgenti incorporate nei file compilati: lo usa solo la misura della copertura (copertura-hook.mjs).
import * as vite from 'vite'

export * from 'vite'
export const build = (config = {}) => vite.build({ ...config, build: { ...config.build, sourcemap: 'inline' } })
