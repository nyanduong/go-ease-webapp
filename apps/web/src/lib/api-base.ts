/** Deployment config is public. Relative /api resolves against the actual page. */
export function resolveApiBase(apiBase: string, pageOrigin: string, httpsOnly = true) {
  const page = new URL(pageOrigin);
  if (!apiBase || apiBase.trim() !== apiBase || apiBase.startsWith('//') || apiBase.includes('\\')) throw new Error('Invalid API base');
  const api = new URL(apiBase, page);
  if (!['https:', ...(httpsOnly ? [] : ['http:'])].includes(api.protocol)
    || !['https:', ...(httpsOnly ? [] : ['http:'])].includes(page.protocol)
    || api.origin !== page.origin || api.username || api.password || api.search || api.hash
    || page.username || page.password || page.search || page.hash || page.pathname !== '/') throw new Error('Invalid API base');
  return api.href.replace(/\/+$/, '');
}
