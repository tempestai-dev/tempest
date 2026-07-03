// Run with: node scripts/generate-blog-index.js  (or: npm run blog:index)
// Reads YAML frontmatter from every public/blogs/*.mdx file and fully regenerates index.json.

const fs = require('fs')
const path = require('path')

const BLOGS_DIR = path.join(__dirname, '..', 'public', 'blogs')
const INDEX_PATH = path.join(BLOGS_DIR, 'index.json')

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  const yaml = match[1]
  const result = {}

  for (const line of yaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trim()

    if (val.startsWith('[') && val.endsWith(']')) {
      result[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else {
      result[key] = val.replace(/^['"]|['"]$/g, '')
    }
  }

  return result
}

const mdxFiles = fs.readdirSync(BLOGS_DIR).filter((f) => f.endsWith('.mdx'))
const posts = []

for (const file of mdxFiles) {
  const slug = path.basename(file, '.mdx')
  const content = fs.readFileSync(path.join(BLOGS_DIR, file), 'utf-8')
  const fm = parseFrontmatter(content)

  if (!fm) {
    console.warn(`Warning: ${file} has no frontmatter — skipping.`)
    continue
  }

  posts.push({
    slug: fm.slug || slug,
    title: fm.title || slug,
    date: fm.date || new Date().toISOString().split('T')[0],
    type: fm.type || 'blog',
    description: fm.description || '',
    author: fm.author || '',
    tags: Array.isArray(fm.tags) ? fm.tags : [],
  })
}

posts.sort((a, b) => new Date(b.date) - new Date(a.date))
fs.writeFileSync(INDEX_PATH, JSON.stringify(posts, null, 2))
console.log(`Generated index.json with ${posts.length} post(s).`)
