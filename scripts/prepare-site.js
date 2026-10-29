'use strict'
// Genera link reali nell'HTML: download e documentazione restano utilizzabili senza JavaScript o senza API.
const fs = require('node:fs'), path = require('node:path')
function prepare({ directory = path.resolve(__dirname, '../sito'), repository, url } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository || '')) throw new Error('Indica il repository GitHub nel formato utente/progetto')
  const base = `https://github.com/${repository}`
  let html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  html = html.replace(/<a\b[^>]*>/g, tag => {
    const github = tag.match(/\bdata-github="([^"]*)"/)
    const target = github ? `${base}/${github[1]}`.replace(/\/$/, '') : /\bdata-scarica-(?:os|file)=/.test(tag) ? `${base}/releases` : null
    return target ? tag.replace(/\bhref="[^"]*"/, `href="${target}"`) : tag
  })
  if (url) {
    const canonical = new URL(url)
    if (canonical.protocol !== 'https:' || canonical.username || canonical.password || canonical.search || canonical.hash) throw new Error('Indica un indirizzo HTTPS pubblico per il sito')
    if (!canonical.pathname.endsWith('/')) canonical.pathname += '/'
    html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${new URL('img/panoramica-chiaro.webp', canonical).href}">`)
    html = html.replace(/<link rel="canonical"[^>]*>\s*|<meta property="og:url"[^>]*>\s*/g, '')
    html = html.replace('</head>', `<link rel="canonical" href="${canonical.href}">\n<meta property="og:url" content="${canonical.href}">\n</head>`)
  }
  fs.writeFileSync(path.join(directory, 'index.html'), html)
  fs.writeFileSync(path.join(directory, 'config.js'), `window.TIO_PROGETTO = ${JSON.stringify(repository)}\n`)
}
if (require.main === module) {
  try {
    prepare({ repository: process.argv[2] || process.env.GITHUB_REPOSITORY, url: process.argv[3] || process.env.TIO_SITE_URL })
    console.log('Pagina preparata con collegamenti statici al repository')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { prepare }
