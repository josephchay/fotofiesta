#!/usr/bin/env node
/**
 * Local dev server that asks for your Unsplash Access Key in the terminal and
 * injects it into assets/js/app.js *as the file is served*.
 *
 * Nothing on disk is modified: the key lives only in this process's memory
 * and disappears when you stop the server (Ctrl+C).
 *
 * Usage:
 *   npm start                                   -> prompts for the key
 *   UNSPLASH_ACCESS_KEY=xxx npm start           -> uses the env var, no prompt
 *   node scripts/serve.js --port 3000           -> custom port (default 8000)
 *   node scripts/serve.js --host 0.0.0.0        -> reachable from other devices on your network
 *
 * No dependencies, works on any Node.js version.
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ROOT = path.resolve(__dirname, '..')
const APP_JS_URL = '/assets/js/app.js' // the file that gets the key injected
const PLACEHOLDER = 'YOUR_ACCESS_KEY'

// Matches: const UNSPLASH_ACCESS_KEY = 'anything'   (single, double or backtick quotes)
const KEY_LINE = /^(\s*const\s+UNSPLASH_ACCESS_KEY\s*=\s*)(['"`])(.*?)\2/m

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function parseArgs(argv) {
  const args = { port: 8000, host: '127.0.0.1', key: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--port') args.port = parseInt(argv[++i], 10) || args.port
    else if (arg === '--host') args.host = argv[++i] || args.host
    else if (!arg.startsWith('--') && !args.key) args.key = arg
  }
  return args
}

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function mask(key) {
  return key.length <= 8 ? '****' : `${key.slice(0, 4)}…${key.slice(-4)}`
}

function cleanKey(raw) {
  const key = (raw || '').trim().replace(/^['"`]|['"`]$/g, '')
  if (!key) fail('No key entered.')
  if (key === PLACEHOLDER) fail('That is the placeholder value. Enter your real Access Key.')
  if (/[\s'"`\\]/.test(key)) fail('The key contains spaces or quote characters. Paste only the key itself.')
  if (key.length < 20) {
    console.warn('\n⚠ That key looks shorter than usual (Unsplash keys are ~43 characters). Continuing anyway.')
  }
  return key
}

function createServer(accessKey) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      return res.end('Method Not Allowed')
    }

    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      res.writeHead(400)
      return res.end('Bad Request')
    }

    // Never serve hidden files/folders (.git, .env, ...) or node_modules
    const segments = pathname.split('/').filter(Boolean)
    if (segments.some((s) => s.startsWith('.') || s === 'node_modules')) {
      res.writeHead(404)
      return res.end('Not Found')
    }

    let filePath = path.join(ROOT, pathname)
    // Block path traversal (../)
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403)
      return res.end('Forbidden')
    }

    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html')

      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          return res.end(`Not Found: ${pathname}`)
        }

        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
        const headers = { 'Content-Type': type }

        // Inject the key into the response only. The file on disk is never touched.
        if (pathname === APP_JS_URL) {
          const injected = data
            .toString('utf8')
            .replace(KEY_LINE, (m, prefix) => `${prefix}'${accessKey}'`)
          headers['Cache-Control'] = 'no-store'
          res.writeHead(200, headers)
          return res.end(req.method === 'HEAD' ? undefined : injected)
        }

        res.writeHead(200, headers)
        res.end(req.method === 'HEAD' ? undefined : data)
      })
    })
  })
}

function listen(server, startPort, host) {
  let port = startPort
  let attemptsLeft = 10

  // Handlers are registered once, so a busy port can't leave a stale callback behind
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft-- > 0) {
      console.log(`  Port ${port} is busy, trying ${port + 1}…`)
      port += 1
      server.listen(port, host)
    } else {
      fail(error.message)
    }
  })

  server.once('listening', () => {
    const shownHost = host === '0.0.0.0' ? 'localhost' : host
    console.log(`\n✔ FotoFiesta running at http://${shownHost}:${port}`)
    if (host === '0.0.0.0') {
      console.log('  ⚠ Listening on your whole network: anyone on it can load the page (and see your key in app.js).')
    }
    console.log('  Press Ctrl+C to stop. The key is discarded when the server stops.\n')
  })

  server.listen(port, host)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // Sanity check: make sure app.js has a key line we can inject into
  const appJsPath = path.join(ROOT, APP_JS_URL)
  if (!fs.existsSync(appJsPath)) {
    fail(`Could not find ${path.relative(process.cwd(), appJsPath)}`)
  }
  if (!KEY_LINE.test(fs.readFileSync(appJsPath, 'utf8'))) {
    fail(`Could not find a "const UNSPLASH_ACCESS_KEY = '...'" line in ${APP_JS_URL}`)
  }

  let key = args.key || process.env.UNSPLASH_ACCESS_KEY

  if (!key) {
    console.log('\nFotoFiesta · Unsplash setup')
    console.log('1. Create an app at https://unsplash.com/oauth/applications')
    console.log('2. Copy the "Access Key" (NOT the "Secret Key")')
    console.log('   (it is used for this session only and is never written to disk)\n')
    key = await ask('Paste your Unsplash Access Key: ')
  }

  key = cleanKey(key)
  console.log(`\n  Using key ${mask(key)}`)

  listen(createServer(key), args.port, args.host)
}

main().catch((error) => fail(error.message))
