process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const Agent = require('socks5-https-client/lib/Agent');
const mongoose = require('mongoose');
const config = require('./config');

mongoose.connect(config.mongo.url, config.mongo.options, (err) => {
  if (err) {
    console.log('[Mongoose]', 'Ошибка подключения: ' + err);
    process.exit(-1);
  } else {
    console.log('[Mongoose]', 'Соединение установлено');
  }
});

mongoose.connection.on('disconnected', () => { console.log('[Mongoose]', 'Соединение разорвано'); });
mongoose.connection.on('reconnect', () => { console.log('[Mongoose]', 'Соединение перезапущено'); });

// Обход РКН через ТОР на домашнем компе (на сервере всё работает напрямую)
const proxyConfig = {};
if (process.env.NODE_ENV === 'development') {
  proxyConfig.agentClass = Agent;
  proxyConfig.agentOptions = {
    socksHost: '127.0.0.1',
    socksPort: 9050,
  }
};

const bot = new TelegramBot(config.telegramToken, { polling: true, request: proxyConfig });

bot.on('polling_error', (err) => {
  if (err.message.match(/502 Bad Gateway/i)) {
    console.log('[Telegram] EPARSE: Error parsing Telegram response (502 Bad Gateway)');
  } else {
    console.log('[Telegram]', err.message);
  }
});

bot.on('error', (err) => {
  console.log('[Telegram]', err.message);
});

bot.getMe().then((res) => { botData = res });
require('./handlers')(bot);