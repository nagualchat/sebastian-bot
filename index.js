const TelegramBot = require('node-telegram-bot-api'); 
const MongoClient = require("mongodb").MongoClient;
const moment = require('moment');

const config = require('./config/config');
const messages = require('./config/messages');

var mongoUsers, mongoDeleted;
var lastGoodDay, lastGoodNight;
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
  mongoUsers = database.collection('users');
});

var bot = new TelegramBot(config.token, {polling: true});
bot.getMe().then((res) => { botMe = res });

bot.on('polling_error', (err) => {
  console.log('[Telegram] polling error:', err.message);
});

// Приветствование вошедших участников; фразы выбираются случайным образом
// Для новых участников - одно приветствие, для вернувшихся - другое, для быстро вернувшихся - третье
bot.on('new_chat_members', async (msg) => {
  if (msg.new_chat_member.id == botMe.id) return; // Чтобы не приветствовал самого себя
  if (msg.new_chat_member.is_bot === true) {
    await bot.kickChatMember(msg.chat.id, msg.new_chat_member.id);
    await bot.sendPhoto(msg.chat.id, messages.kickBotImg, {caption: messages.kickBotMsg});
    return;
  };
  newMembers[msg.new_chat_member.id] = msg.date; // Для антиспама
  mongoUsers.findOne({userId: msg.new_chat_member.id}, function (err, user) {
    if (err) {
      console.log('[Mongo] find user error:', err.message);
      return;
    }
    if (!user) {
      bot.sendMessage(msg.chat.id, randomMessage(messages.welcomeNew).replace('$name', nameToBeShow(msg.new_chat_member)), {parse_mode : 'markdown'});
      mongoUsers.insertOne({userId: msg.new_chat_member.id, joinDate: msg.date});
    } else {
      if (moment().diff(moment.unix(user.joinDate), 'hours') <= config.joinPeriod) {
        bot.sendMessage(msg.chat.id, randomMessage(messages.welcomeRet1).replace('$name', nameToBeShow(msg.new_chat_member)));
        mongoUsers.update({userId: msg.new_chat_member.id}, {$set: {joinDate: msg.date}})
      } else {
        bot.sendMessage(msg.chat.id, randomMessage(messages.welcomeRet2).replace('$name', nameToBeShow(msg.new_chat_member)));
        mongoUsers.update({userId: msg.new_chat_member.id}, {$set: {joinDate: msg.date}})
      }
    }
  })
});

// Начисление очков благодарности
bot.onText(/спасибо|благодарю|^(спс|thx)(\.|\!)?$/i, (msg) => {
  if (msg.reply_to_message && msg.reply_to_message.from.id != msg.from.id && msg.reply_to_message.from.id != botMe.id) {
    mongoUsers.findOne({userId: msg.reply_to_message.from.id}, function (err, user) {
      if (err) {
        console.log('[Mongo] find user error:', err.message);
        return;
      }
      if (!user) {
        mongoUsers.insertOne({userId: msg.reply_to_message.from.id, repPoints: 1});
        bot.sendMessage(msg.chat.id, randomMessage(messages.repThxFirst).replace('$name', nameToBeShow(msg.reply_to_message.from)).replace('$points', count));
      } else if (!user.repPoints) {
        mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {repPoints: 1}})
        bot.sendMessage(msg.chat.id, randomMessage(messages.repThxFirst).replace('$name', nameToBeShow(msg.reply_to_message.from)).replace('$points', count));
      } else {
        var count = user.repPoints + 1;
        mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {repPoints: count}})
        bot.sendMessage(msg.chat.id, randomMessage(messages.repThx).replace('$name', nameToBeShow(msg.reply_to_message.from)).replace('$points', count));
      }
    })
  }
});

bot.onText(/плюсую|^(👍|\+)(\.|\!)?$/i, (msg) => {  
  if (msg.reply_to_message && msg.reply_to_message.from.id != msg.from.id && msg.reply_to_message.from.id != botMe.id) {
    mongoUsers.findOne({userId: msg.reply_to_message.from.id}, function (err, user) {
      if (err) {
        console.log('[Mongo] find user error:', err.message);
        return;
      }
      if (!user) {
        mongoUsers.insertOne({userId: msg.reply_to_message.from.id, repPoints: 1});
        bot.sendMessage(msg.chat.id, randomMessage(messages.repPlusFirst).replace('$name', nameToBeShow(msg.reply_to_message.from)).replace('$points', count));
      } else if (!user.repPoints) {
        mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {repPoints: 1}})
        bot.sendMessage(msg.chat.id, randomMessage(messages.repPlusFirst).replace('$name', nameToBeShow(msg.reply_to_message.from)).replace('$points', count));
      } else {
        var count = user.repPoints + 1;
        mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {repPoints: count}})
        bot.sendMessage(msg.chat.id, randomMessage(messages.repPlus).replace('$name', nameToBeShow(msg.reply_to_message.from)).replace('$points', count));
      }
    })
  }
});

// Команда /me, отображающая накопленные очки благодарности
bot.onText(/\/me/, (msg) => {
  mongoUsers.findOne({userId: msg.from.id}, function (err, user) {
    if (err) {
      console.log('[Mongo] find user error:', err.message);
      return;
    }
    if (!user || user.repPoints == 0) {
      bot.sendMessage(msg.chat.id, messages.showRep0.replace('$name', nameToBeShow(msg.from)));
    } else {
      bot.sendMessage(msg.chat.id, messages.showRep.replace('$name', nameToBeShow(msg.from)).replace('$points', user.repPoints));      
    }
  })
});

bot.onText(/\/start/, (msg) => {
  if (msg.chat.type == 'private') {
    bot.sendMessage(msg.chat.id, messages.help);
  }
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, messages.help);
});

// Команда /say, отправляющая сообщение в группу от лица бота (доступна только админам)
bot.onText(/\/say (.+)/, async (msg, match) => {
  if (msg.chat.type == 'private' &&  await isAdmin(config.group, msg.from.id)) {
    bot.sendMessage(config.group, match[1]); 
  }
});

// Ответ бота на пожелания доброго утра и спокойной ночи
bot.onText(/добр\S* утр\S*|утр\S* добро\S*|^(утра|утречка)(\.|\!)?$/i, (msg) => {
  if (!lastGoodDay) {
    bot.sendMessage(msg.chat.id, randomMessage(messages.goodDay));
    lastGoodDay = msg.date;
  } else if (moment().diff(moment.unix(lastGoodDay), 'seconds') >= config.responseTimeout) {
     bot.sendMessage(msg.chat.id, randomMessage(messages.goodDay));
     lastGoodDay = msg.date;
  }
});

bot.onText(/спокойной ночи|приятных снов\S*|доброноч\S*|^(ночки|ночки всем|снов|всем снов)(\.|\!)?$/i, (msg) => {
  if (!lastGoodNight) {
    bot.sendMessage(msg.chat.id, randomMessage(messages.goodNight));
    lastGoodNight = msg.date;
  } else if (moment().diff(moment.unix(lastGoodNight), 'seconds') >= config.responseTimeout) {
     bot.sendMessage(msg.chat.id, randomMessage(messages.goodNight));
     lastGoodNight = msg.date;
  }
});

// Бот в ответ на вопрос типа "Себастьян, 1 или 2?" случайно выбирает один из перечисленных вариантов.
bot.onText(/себастьян(\,)? (.+) или (.+)\?$/i, (msg, match) => {
  var numbers = [2, 3];
  var index = Math.floor(Math.random() * numbers.length);
  bot.sendMessage(msg.chat.id, capitalize(match[numbers[index]]) + '.');
});

// Команда /del, удаляющая процитированное сообщение (доступна только админам)
// Если команда вызвана с агрументом, то он выводится как причина удаления
// Удалённые сообщения сохраняются и при запросе высылаются пользователю в приват
bot.onText(/\/(del+) ?(.+)?/, async (msg, match) => {
  if (msg.chat.type == 'supergroup' && await isAdmin(msg.chat.id, msg.from.id)) {
    forward = await bot.forwardMessage(config.channel, msg.chat.id, msg.reply_to_message.message_id, {disable_notification:true});  
    if (match[2]) {
      report = await bot.sendMessage(msg.chat.id, messages.deleteDel2.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      nameToBeShow(msg.reply_to_message.from) + '</a>') + match[2], {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: 'Показать', callback_data: 'sendDelMsg'}]]}});
    } else {
      report = await bot.sendMessage(msg.chat.id, messages.deleteDel1.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages.reportBtn, callback_data: 'sendDelMsg'}]]}});
    }
      mongoDeleted.insertOne({msg, reportId: report.message_id, forwardId: forward.message_id});
      bot.deleteMessage(msg.chat.id, msg.reply_to_message.message_id);
    };
});

// Антиспам, который действует для недавно вошедших в чат участников
// Срабатывает на ссылки типа @username, t.me, telegram.me и forward, удаляя сообщения
// Удалённые сообщения сохраняются и при запросе высылаются пользователю в приват
bot.on('text', async (msg) => {
  if (msg.chat.type == 'private') console.log('[Log]', nameToBeShow(msg.from) + ' (' + msg.from.id + ')' + ' wrote to bot: ' + msg.text);
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
    console.log('[Log]', nameToBeShow(msg.from) + ' (' + msg.from.id + ')' + ' pressed the sendDelMsg button under ' + msg.message.message_id + ' bot message');
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

// Функция для вывода второй части имени, если она есть
const nameToBeShow = (msg) => {
  if (msg.last_name != undefined) {
    return msg.first_name + ' ' + msg.last_name;
  } else {
    return msg.first_name;
  }
};

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
  nameToBeShow(msg.from) + '</a>'), {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages.reportBtn, callback_data: 'sendDelMsg'}]]}});
  mongoDeleted.insertOne({msg, reportId: report.message_id, forwardId: forward.message_id});
  bot.deleteMessage(msg.chat.id, msg.message_id);
};

// Функция для выбора случайной строки из массива
const randomMessage = (message) => {
  var randomIndex = Math.floor(Math.random() * message.length);
  return message[randomIndex];
};

// Функция делает первую букву строки заглавной
function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
