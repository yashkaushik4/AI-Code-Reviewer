import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

dotenv.config()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const USERS_FILE = path.join(__dirname, 'data', 'users.json')

const app = express()
app.use(cors({
  origin: 'http://localhost:5174',
  credentials: true
}))
app.use(express.json())

// ensure data dir and users file exist
async function ensureUsersFile(){
  const dir = path.join(__dirname, 'data')
  try{
    await fs.mkdir(dir, { recursive: true })
    try {
      await fs.access(USERS_FILE)
    } catch {
      await fs.writeFile(USERS_FILE, JSON.stringify([]))
    }
  }catch(e){
    console.error('Failed to create data file', e)
  }
}
await ensureUsersFile()

async function readUsers(){
  const raw = await fs.readFile(USERS_FILE, 'utf8')
  return JSON.parse(raw)
}
async function writeUsers(users){
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2))
}

// --- Helpers
function generateToken(user){
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
}
async function findUserByEmail(email){
  const users = await readUsers()
  return users.find(u => u.email.toLowerCase() === email.toLowerCase())
}

// --- Auth Routes
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  const existing = await findUserByEmail(email)
  if (existing) return res.status(409).json({ error: 'user already exists' })
  const hashed = await bcrypt.hash(password, 10)
  const users = await readUsers()
  const newUser = { id: uuidv4(), email, passwordHash: hashed, createdAt: new Date().toISOString() }
  users.push(newUser)
  await writeUsers(users)
  const token = generateToken(newUser)
  res.json({ token, user: { id: newUser.id, email: newUser.email } })
})

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  const user = await findUserByEmail(email)
  if (!user) return res.status(401).json({ error: 'invalid credentials' })
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'invalid credentials' })
  const token = generateToken(user)
  res.json({ token, user: { id: user.id, email: user.email } })
})

// Simple middleware to protect routes
function authMiddleware(req, res, next){
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: 'missing authorization' })
  const parts = auth.split(' ')
  if (parts.length !== 2) return res.status(401).json({ error: 'invalid authorization header' })
  const token = parts[1]
  try{
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  }catch(e){
    return res.status(401).json({ error: 'invalid token' })
  }
}

// --- AI Review Endpoint (demo / plug your AI here)
// Protected endpoint: requires Bearer token.
app.post('/ai/get-review', authMiddleware, async (req, res) => {
  const { code } = req.body
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'code required' })

  // === DEMO: Simple heuristic review (replace with real AI call) ===
  const lines = code.split('\n').length
  const hasConsole = /console\\.log|print\\(|System\\.out\\.println/.test(code)
  const trailingWhitespace = /\\s+$/.test(code)
  const suggestions = []
  if (lines > 200) suggestions.push('File is large (>200 lines). Consider splitting into modules.')
  if (hasConsole) suggestions.push('Found debug print statements. Remove or guard them in production.')
  if (trailingWhitespace) suggestions.push('There appear to be trailing spaces on the last line.')
  if (suggestions.length === 0) suggestions.push('No obvious issues detected by the heuristic review.')

  // Example markdown review
  const reviewMarkdown = [
    `# Automated Review`,
    `**Lines:** ${lines}`,
    `**Author:** ${req.user.email}`,
    ``,
    `## Suggestions`,
    suggestions.map(s => `- ${s}`).join('\\n'),
    ``,
    `## Tips`,
    `- Run a linter (ESLint / flake8) for deeper checks.`,
    `- Add unit tests for critical logic.`
  ].join('\\n')

  res.json({ review: reviewMarkdown })
})

// small protected route example
app.get('/me', authMiddleware, async (req, res) => {
  const users = await readUsers()
  const u = users.find(x => x.id === req.user.id)
  if (!u) return res.status(404).json({ error: 'not found' })
  res.json({ user: { id: u.id, email: u.email, createdAt: u.createdAt }})
})

// start
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
