const mineflayer = require('mineflayer')
const express = require('express')
const fetch = require('node-fetch')
const os = require('os')
const { execSync } = require('child_process')
const ProxyAgent = require('proxy-agent')

const TELEGRAM_BOT_TOKEN = '8184857901:AAGHLGeX5VUgRouxsmIXBPDV6Zl5KPqarkw'
const CHAT_ID = '6790410023'
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1376391242576957562/2cmM6ySlCSlbSvYMIn_jVQ6zZLGH6OLx5LLhuzDNh4mxFdHNQSqgRnKcaNvilZ-m8HSe'
const PIN = '0301'

// === Cấu hình proxy ===
let useProxy = false // true để bật proxy, false tắt proxy
const proxyConfig = {
  protocol: 'socks5', // socks5 hoặc http
  host: '127.0.0.1',
  port: 1080,
  username: '', // nếu proxy cần user/pass thì điền, không thì để ''
  password: ''
}

let bot, botActive = true, spamEnabled = false, spamInterval
let lastUpdateId = 0, chatBuffer = [], lastLogs = []

function getProxyUrl() {
  if (!useProxy) return null
  const auth = proxyConfig.username && proxyConfig.password
    ? `${proxyConfig.username}:${proxyConfig.password}@`
    : ''
  return `${proxyConfig.protocol}://${auth}${proxyConfig.host}:${proxyConfig.port}`
}

function createBot() {
  const options = {
    host: '2y2c.org',
    username: 'nahiwinhaha',
    version: '1.20.4'
  }
  if (useProxy) {
    const proxyUrl = getProxyUrl()
    if (proxyUrl) {
      options.agent = new ProxyAgent(proxyUrl)
      console.log('🌐 Đang sử dụng proxy:', proxyUrl)
    }
  } else {
    console.log('🌐 Không sử dụng proxy')
  }

  bot = mineflayer.createBot(options)

  bot.on('spawn', () => {
    const loginInterval = setInterval(() => {
      bot.chat('/register 03012001 03012001')
      bot.chat('/login 03012001')
    }, 2000)

    setTimeout(() => {
      clearInterval(loginInterval)
      try { bot.chat('/avn') } catch {}
    }, 10000)

    setInterval(() => {
      bot.setControlState('jump', true)
      setTimeout(() => bot.setControlState('jump', false), 300)
      if (bot.entity && bot.entity.yaw !== undefined) {
        bot.look(Math.random() * Math.PI * 2, 0, true)
      }
    }, 30000)

    setInterval(async () => {
      if (!bot.entity) return
      const p = bot.entity.position
      const stats = getSystemStats()
      const msg = `📍 Tọa độ: X:${p.x.toFixed(1)} Y:${p.y.toFixed(1)} Z:${p.z.toFixed(1)}\n${stats}`
      await sendMessage(msg)
    }, 60000)
  })

  bot.on('chat', (username, msg) => {
    if (username === bot.username) return
    chatBuffer.push({ username, msg })
    lastLogs.push(`[${username}]: ${msg}`)
    if (lastLogs.length > 100) lastLogs.shift()
  })

  bot.on('windowOpen', async window => {
    for (let i = 0; i < window.slots.length; i++) {
      const item = window.slots[i]
      if (item) try {
        await bot.clickWindow(i, 0, 0)
        await new Promise(r => setTimeout(r, 500))
      } catch {}
    }
  })

  bot.on('kicked', async reason => await sendMessage(`⛔ Bot bị kick:\n${reason}`))
  bot.on('error', async err => await sendMessage(`❌ Lỗi bot:\n${err.message || err}`))
  bot.on('end', async () => {
    await sendMessage(`🔁 Bot ngắt kết nối. Đang kết nối lại sau 10s...`)
    if (botActive) setTimeout(createBot, 10000)
  })
}
createBot()

setInterval(async () => {
  if (chatBuffer.length === 0) return
  for (const m of chatBuffer) await sendDiscordEmbed(m.username, m.msg)
  await sendMessage(chatBuffer.map(m => `[${m.username}]: ${m.msg}`).join('\n'))
  chatBuffer = []
}, 5000)

async function sendMessage(msg) {
  try {
    await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
    })
  } catch {}
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg })
    })
  } catch {}
}

async function sendDiscordEmbed(user, msg) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ title: `💬 Từ ${user}`, description: msg, color: 0x00AAFF, timestamp: new Date().toISOString() }]
      })
    })
  } catch {}
}

setInterval(async () => {
  try {
    const res = await fetch(`${TELEGRAM_API_URL}/getUpdates?offset=${lastUpdateId + 1}`)
    const data = await res.json()
    if (!data.result) return
    for (const update of data.result) {
      lastUpdateId = update.update_id
      const m = update.message
      if (!m || !m.text || m.chat.id != CHAT_ID) continue
      if (bot && bot.chat && bot._client?.state === 'play') bot.chat(m.text.trim())
    }
  } catch {}
}, 2000)

function getSystemStats() {
  try {
    const total = os.totalmem(), free = os.freemem(), used = total - free
    const cpu = os.loadavg()[0]
    const disk = execSync('df -h /').toString().split('\n')[1]?.split(/\s+/)[4] || 'N/A'
    return `🧠 RAM: ${(used / 1024 ** 2).toFixed(1)}MB / ${(total / 1024 ** 2).toFixed(1)}MB\n⚙️ CPU: ${cpu.toFixed(2)}\n💽 Disk: ${disk}`
  } catch { return `❌ Lỗi lấy hệ thống` }
}

const app = express()

app.get('/', (req, res) => {
  const pin = req.query.pin
  if (pin !== PIN) return res.send(`<form><input name="pin" placeholder="🔐 Nhập mã PIN"/><button>Vào</button></form>`)
  const players = bot?.players ? Object.keys(bot.players).map(p => `<li>${p}</li>`).join('') : '<li>Đang tải...</li>'
  res.send(`<html><head><title>Bot Controller</title><style>
    body { background: linear-gradient(#000015, #000000); color: #fff; font-family: sans-serif; text-align: center; padding: 20px; }
    input, button { padding: 10px; margin: 5px; border-radius: 8px; border: none; }
    button { background: #222; color: white; border: 1px solid #0ff; }
    ul { list-style: none; padding: 0 }
    li { padding: 2px 0; }
    .panel { background: rgba(0,0,0,0.6); padding: 20px; border-radius: 15px; display: inline-block; }
    .proxy-info { margin: 10px 0; font-weight: bold; color: #0ff; }
  </style></head><body>
  <div class="panel">
    <h1>🚀 Điều khiển Bot Minecraft</h1>
    <h3>🧑‍🤝‍🧑 Người chơi online:</h3>
    <ul id="players">${players}</ul>

    <div class="proxy-info">Proxy: ${useProxy ? getProxyUrl() : '<span style="color:red;">Tắt</span>'}</div>
    <form action="/toggleProxy" method="GET"><button>${useProxy ? '⛔ Tắt Proxy' : '✅ Bật Proxy'}</button></form>

    <form action="/chat"><input name="msg" placeholder="💬 Tin nhắn"/><button>Gửi</button></form><br>
    <form action="/toggleSpam"><button>${spamEnabled ? '⛔ Tắt spam' : '✅ Bật spam'}</button></form><br>
    <form action="/disconnect"><button>❌ Ngắt bot</button></form><br>
    <form action="/reconnect"><button>🔁 Kết nối lại bot</button></form><br>
    <form action="/chatlog"><button>📜 Xem log chat</button></form>
  </div>
  <script>
    setInterval(() => {
      fetch('/tablist').then(res => res.json()).then(data => {
        document.getElementById('players').innerHTML = data.map(p => '<li>' + p + '</li>').join('')
      })
    }, 10000)
  </script></body></html>`)
})

app.get('/toggleProxy', (req, res) => {
  useProxy = !useProxy
  if (bot) {
    bot.quit()
    botActive = false
  }
  // Tạo lại bot sau 3s với trạng thái proxy mới
  setTimeout(() => {
    botActive = true
    createBot()
  }, 3000)
  res.redirect('/?pin=' + PIN)
})

app.get('/tablist', (req, res) => {
  const list = bot?.players ? Object.keys(bot.players) : []
  res.json(list)
})

app.get('/chat', (req, res) => {
  const msg = req.query.msg
  if (!bot || !bot.chat || bot._client?.state !== 'play') return res.send('⚠️ Bot chưa sẵn sàng để chat.')
  try { if (msg) bot.chat(msg) } catch (err) { return res.send('❌ Lỗi khi bot chat.') }
  res.redirect('/?pin=' + PIN)
})

app.get('/toggleSpam', (req, res) => {
  if (!bot || !bot.chat || bot._client?.state !== 'play') return res.send('⚠️ Bot chưa sẵn sàng để spam.')
  spamEnabled = !spamEnabled
  if (spamEnabled) {
    spamInterval = setInterval(() => {
      try { bot.chat('Memaybeo') } catch {}
    }, 3000)
  } else clearInterval(spamInterval)
  res.redirect('/?pin=' + PIN)
})

app.get('/disconnect', (req, res) => {
  if (bot) bot.quit()
  botActive = false
  res.redirect('/?pin=' + PIN)
})

app.get('/reconnect', (req, res) => {
  if (!botActive) {
    botActive = true
    createBot()
  }
  res.redirect('/?pin=' + PIN)
})

app.get('/chatlog', (req, res) => {
  res.send(`<pre>${lastLogs.slice(-30).join('\n')}</pre><a href="/?pin=${PIN}">🔙 Quay lại</a>`)
})

const PORT = process.env.PORT || 10000
app.listen(PORT, () => console.log(`🌐 Web bot chạy tại cổng ${PORT}`))
