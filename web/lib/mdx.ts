import fs from 'fs'
import path from 'path'

export type PostType = 'blog' | 'dev-log' | 'release-notes'

export interface BlogPost {
  slug: string
  title: string
  date: string
  type: PostType
  description: string
  author: string
  tags: string[]
}

const BLOGS_DIR = path.join(process.cwd(), 'public', 'blogs')

export function getAllPosts(): BlogPost[] {
  const raw = fs.readFileSync(path.join(BLOGS_DIR, 'index.json'), 'utf-8')
  const posts: BlogPost[] = JSON.parse(raw)
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return getAllPosts().find((p) => p.slug === slug)
}

export function getChangelogPosts(): BlogPost[] {
  return getAllPosts().filter((p) => p.type === 'release-notes')
}

export function getPostContent(slug: string): string {
  const raw = fs.readFileSync(path.join(BLOGS_DIR, `${slug}.mdx`), 'utf-8')
  return raw.replace(/^---[\s\S]*?---\r?\n/, '')
}
