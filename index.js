const TelegramBot = require('node-telegram-bot-api'); 
const MongoClient = require("mongodb").MongoClient;
const moment = require('moment');

const config = require('./config/config');
const messages = require('./config/messages');

var mongoUsers, mongoDeleted;
var report, forward;
var newMembers = {};

// Хак для того, чтобы не зависнуть на стадии building во время развёртывания в now
const {createServer} = require('http');
const server = createServer(() => {});
server.listen(3000);

MongoClient.connect(config.mongoConnectUrl, (err, database) => {
  if (err) {
    console.log('[Mongo] connection error:', err.message);
    return database.close();
  }
  mongoDeleted = database.collection('deleted_messages');
  mongoUsers = database.collection('new_users');
});

var bot = new TelegramBot(config.token, {polling: true});
bot.getMe().then((res) => { botId = res.id });

bot.on('polling_error', (err) => {
  console.log('[Telegram] polling error:', err.message);
});

// Приветствование вошедших участников; фразы выбираются случайным образом
// Для новых участников - одно приветствие, для вернувшихся - другое, для быстро вернувшихся - третье
bot.on('new_chat_members', async (msg) => {
  if (msg.new_chat_member.id == botId) return; // Чтобы бот не приветствовал самого себя
  newMembers[msg.new_chat_member.id] = msg.date; // Для антиспама
  mongoUsers.findOne({userId: msg.new_chat_member.id}, function (err, user) {
    if (err) {
      console.log('[Mongo] find new users error:', err.message);
      return;
    }
    if (!user) {
      bot.sendMessage(msg.chat.id, randomMessage(messages.welcomeNew).replace('$name', msg.new_chat_member.first_name));
      mongoUsers.insertOne({userId: msg.new_chat_member.id, joinDate: msg.date});
    } else {
      if (moment().diff(moment.unix(user.joinDate), 'hours') <= config.joinPeriod) {
        bot.sendMessage(msg.chat.id, randomMessage(messages.welcomeRet1).replace('$name', msg.new_chat_member.first_name));
        mongoUsers.update({userId: msg.new_chat_member.id}, {$set: {joinDate: msg.date}})
      } else {
        bot.sendMessage(msg.chat.id, randomMessage(messages.welcomeRet2).replace('$name', msg.new_chat_member.first_name));
        mongoUsers.update({userId: msg.new_chat_member.id}, {$set: {joinDate: msg.date}})
      }
    }
  })
});

bot.onText(/\/start/, (msg) => {
  if (msg.chat.type == 'private') {
    bot.sendMessage(msg.chat.id, messages.start);
  }
});

// Команда /say, отправляющая сообщение в группу от лица бота (доступна только админам)
bot.onText(/\/say (.+)/, async (msg, match) => {
  if (msg.chat.type == 'private' &&  await isAdmin(config.group, msg.from.id)) {
    bot.sendMessage(config.group, match[1]); 
  }
});

// Команда /del, удаляющая процитированное сообщение (доступна только админам)
// Если команда вызвана с агрументом, то он выводится как причина удаления
// Удалённые сообщения сохраняются и при запросе высылаются пользователю в приват
bot.onText(/\/(del+) ?(.+)?/, async (msg, match) => {
  if (msg.chat.type == 'supergroup' && await isAdmin(msg.chat.id, msg.from.id)) {
    forward = await bot.forwardMessage(config.channel, msg.chat.id, msg.reply_to_message.message_id, {disable_notification:true});  
    if (match[2]) {
      report = await bot.sendMessage(msg.chat.id, messages.deleteDel2.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      msg.reply_to_message.from.first_name + '</a>') + match[2], {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: 'Показать', callback_data: 'sendDelMsg'}]]}});
    } else {
      report = await bot.sendMessage(msg.chat.id, messages.deleteDel1.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      msg.reply_to_message.from.first_name + '</a>'), {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages.reportBtn, callback_data: 'sendDelMsg'}]]}});
    }
      mongoDeleted.insertOne({msg, reportId: report.message_id, forwardId: forward.message_id});
      bot.deleteMessage(msg.chat.id, msg.reply_to_message.message_id);
    };
});

bot.onText(/доброе утро|доброго утра|утро доброе|утра доброго]|^(утра|утречка)(\.|\!)?$/i, (msg) => {
  bot.sendMessage(msg.chat.id, randomMessage(messages.goodDay));
});

bot.onText(/спокойной ночи|(ночки|ночки всем|снов|всем снов)(\.|\!)?$/i, (msg) => {
  bot.sendMessage(msg.chat.id, randomMessage(messages.goodNight));
});

// Антиспам, который действует для недавно вошедших в чат участников
// Срабатывает на ссылки типа @username, t.me, telegram.me и forward, удаляя сообщения
// Удалённые сообщения сохраняются и при запросе высылаются пользователю в приват
bot.on('text', async (msg) => {
  for (var id in newMembers) {
    if (msg.from.id == id) {
      if (moment().diff(moment.unix(newMembers[id]), 'seconds') <= config.antispamPeriod) {
        var entities = msg.entities || [];
        for ( var entity of entities ) {
          if ( entity.type && entity.type == 'mention' ) return deleteSpam(msg);
        }
        if (/t(?:elegram)?\.me/.test(msg.text)) return deleteSpam(msg);
        if (msg.forward_from_chat) return deleteSpam(msg);
      }
    }
  };
});

// Нажатие на кнопку пересылает сохранённое в канале сообщение пользователю в приват
bot.on('callback_query', async (msg) => {
  if (msg.data === 'sendDelMsg') {
    var answer = await bot.answerCallbackQuery(msg.id);
    mongoDeleted.findOne({reportId: msg.message.message_id}, function (err, find) {
      if (err) {
        console.log('[Mongo] find deleted message error:', err.message);
        return;
      }
      bot.forwardMessage(msg.from.id, config.channel, find.forwardId);
    });
  }
});

// Функция проверяет, является ли пользователь админом
const isAdmin = async (chatId, userId) => {
  const admins = await bot.getChatAdministrators(chatId);
  if (admins.filter(x => x.user.id == userId).length > 0) {
      return true;
    } else {
      return false;
    };
};

// Функция удаления сообщений для антиспама
// Перед удалением сообщение пересылается в канал на хранение
const deleteSpam = async (msg) => {
  forward = await bot.forwardMessage(config.channel, msg.chat.id, msg.message_id, {disable_notification:true});
  report = await bot.sendMessage(msg.chat.id, messages.deleteSpam.replace('$username', '<a href=\"tg://user?id=' + msg.from.id + '/\">' + 
  msg.from.first_name + '</a>'), {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages.reportBtn, callback_data: 'sendDelMsg'}]]}});
  mongoDeleted.insertOne({msg, reportId: report.message_id, forwardId: forward.message_id});
  bot.deleteMessage(msg.chat.id, msg.message_id);
};

// Функция для выбора случайной строки из массива
const randomMessage = (message) => {
  var max = message.length - 1;
  var randomIndex = Math.floor(Math.random() * ((max - 0) + 1));
  return message[randomIndex];
};
