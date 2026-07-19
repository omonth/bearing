import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [indexHtml, nginxConfig, dockerfile] = await Promise.all([
  readFile(path.join(adminRoot, 'dist', 'index.html'), 'utf8'),
  readFile(path.join(adminRoot, 'nginx.conf'), 'utf8'),
  readFile(path.join(adminRoot, 'Dockerfile'), 'utf8'),
])

const assetUrls = [...indexHtml.matchAll(/(?:src|href)="(\/admin\/assets\/[^"?]+)(?:\?[^"#]*)?"/g)].map(
  ([, assetUrl]) => assetUrl,
)

if (!assetUrls.some((assetUrl) => assetUrl.endsWith('.js'))) {
  throw new Error('Admin index does not reference a JavaScript asset under /admin/assets/')
}

if (!assetUrls.some((assetUrl) => assetUrl.endsWith('.css'))) {
  throw new Error('Admin index does not reference a CSS asset under /admin/assets/')
}

for (const assetUrl of assetUrls) {
  const relativePath = assetUrl.slice('/admin/'.length)
  const assetPath = path.join(adminRoot, 'dist', relativePath)
  const assetStat = await stat(assetPath)
  if (!assetStat.isFile()) {
    throw new Error(`${assetUrl} does not resolve to a built file`)
  }
}

const requiredNginxRules = [
  /location\s+\^~\s+\/admin\/assets\//,
  /try_files\s+\$uri\s+=404;/,
  /location\s+\/admin\//,
  /try_files\s+\$uri\s+\$uri\/\s+\/admin\/index\.html;/,
]

for (const rule of requiredNginxRules) {
  if (!rule.test(nginxConfig)) {
    throw new Error(`Missing required nginx rule: ${rule}`)
  }
}

if (!/COPY --from=build \/app\/dist\/ \/usr\/share\/nginx\/html\/admin\//.test(dockerfile)) {
  throw new Error('Docker image does not place the Vite build under /usr/share/nginx/html/admin/')
}

console.log(`Admin container contract verified for ${assetUrls.length} entry assets.`)
