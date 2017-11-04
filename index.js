const MongoClient = require("mongodb").MongoClient;
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api'); 

const tools = require('./tools');
const config = require('./config/config');
const messages = require('./config/messages');

var mongoUsers, mongoFavs, mongoDeleted;
var lastGoodDay, lastGoodNight;
var report, forward;
var newMembers = {};

// Хак для того, чтобы не зависнуть на стадии building во время развёртывания в now
const http = require('http');
http.createServer(function (req, res) {
  res.write('Hello World!');
  res.end();
}).listen(8080);

MongoClient.connect(config.mongoConnectUrl, (err, database) => {
  if (err) {
    console.log('[Mongo] connection error:', err.message);
    return database.close();
  }
  mongoUsers = database.collection('users');
  mongoFavs = database.collection('favorite_messages');
  mongoDeleted = database.collection('deleted_messages');
});

const bot = new TelegramBot(config.token, {polling: true});
bot.getMe().then((res) => { botMe = res });
bot.getChat(config.group).then((res) => { group = res });

bot.on('polling_error', (err) => {
  if (err.message.match(/502 Bad Gateway/i)) {
    console.log('[Telegram] polling error: EPARSE: Error parsing Telegram response (502 Bad Gateway)');
  } else {
    console.log('[Telegram] polling error:', err.message);
  }
});

// Вывод справок
bot.onText(/^\/start$/, (msg) => {
  if (msg.chat.type == 'private') {
    bot.sendMessage(msg.chat.id, messages.help, {parse_mode : 'markdown'});
  }
});

bot.onText(/^\/help$/, (msg) => {
  bot.sendMessage(msg.chat.id, messages.help, {parse_mode : 'markdown'});
});

bot.onText(/^\/admin$/, (msg) => {
  bot.sendMessage(msg.chat.id, messages.admin, {parse_mode : 'markdown'});
});

// Команда /say, отправляющая сообщение в группу от лица бота
bot.onText(/^\/say (.+)/, async (msg, match) => {
  if (msg.chat.type == 'private' &&  await isAdmin(config.group, msg.from.id)) {
    console.log(match[1]);
    bot.sendMessage(config.group, match[1].replace('/n', '\n'), {parse_mode : 'markdown'}); 
  }
});

// Команда /fav, добавляющая сообщение в список избранных
bot.onText(/^\/fav\b ?(.+)?/, (msg, match) => {
  if (msg.chat.type == 'supergroup') {
    if (msg.reply_to_message) {
      if (msg.reply_to_message.from.id != botMe.id) {
        mongoFavs.findOne({messageId: msg.reply_to_message.message_id}, function (err, fav) {
          if (!fav) {
            if (match[1] && match[1].length <= 80) {
              var caption = tools.capitalize(match[1]);
              mongoFavs.insertOne({messageId: msg.reply_to_message.message_id, messageDate: msg.reply_to_message.date, favCreatorId: msg.from.id, favCaption: caption});
              bot.sendMessage(msg.chat.id, messages.favAdd.replace('$fav', '«' + caption + '»'));
            } else {
              bot.sendMessage(msg.chat.id, messages.favAddWrong, {parse_mode : 'markdown'});
            }
          } else {
            bot.sendMessage(msg.chat.id, messages.favAddDupl);
          }
        })
      } else {
        bot.sendMessage(msg.chat.id, messages.favAddWrong, {parse_mode : 'markdown'});
      }
    }
  }
});

// Команда /favs, выводящая список избранных сообщений
bot.onText(/^\/favs\b/, (msg, match) => {
  mongoFavs.find({}).sort({messageDate: 1}).toArray(function(err, doc) {
    if (doc != null) {
      var ans = doc.map(function (u){
        return '<a href="http://t.me/' + group.username + '/' + u.messageId + '">' + u.favCaption + '</a>';       
    });
      bot.sendMessage(msg.chat.id, messages.favList + ans.join('\n'), {parse_mode : 'HTML', disable_web_page_preview: 'true'});
    }
  })
});

// Команда /e, позволяющая изменить имя закладки
bot.onText(/^\/e\b ?([^\s]+)? ?(.+)?/, async (msg, match) => {
  if (match[1] && match[2] && await isAdmin(config.group, msg.from.id)) {
    var id = Number(match[1]);
    mongoFavs.findOne({messageId: id}, function (err, fav) {
      if (fav) {
        mongoFavs.update({messageId: id}, {$set: {favCaption: match[2]}})
        bot.sendMessage(msg.chat.id, messages.favEdit.replace('$fav', '«' + match[2] + '»'));
        } else { 
          bot.sendMessage(msg.chat.id, messages.favNotFound.replace('$fav', id));
        }
      })
    }
});

// Команда /d, удаляющее закладку
bot.onText(/^\/d\b ?(.+)?/, async (msg, match) => {
  if (match[1] && await isAdmin(config.group, msg.from.id)) {
    var id = Number(match[1]);
    mongoFavs.findOne({messageId: id}, function (err, fav) {
      if (fav) {
        mongoFavs.deleteOne({messageId: id});
        bot.sendMessage(msg.chat.id, messages.favDel.replace('$fav', '«' + fav.favCaption + '»'));
        } else { 
          bot.sendMessage(msg.chat.id, messages.favNotFound.replace('$fav', id));
        }
      })
    }
});

// Команда /mute, лишающая пользователя возможности оправлять в чат сообщения
bot.onText(/^\/mute\b ?([^\s]+)? ?(.+)?/, async (msg, match) => {
  if (msg.chat.type == 'supergroup' && msg.reply_to_message && await isAdmin(msg.chat.id, msg.from.id)) {
    if (match[1] && match[2]) {
      bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, {until_date: tools.duration(match[1], 'date'), can_send_messages: false});
      bot.sendMessage(msg.chat.id, 'За ' + match[2] + ' ' + messages.restrictVoice2.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>').replace('$duration', tools.duration(match[1])), {parse_mode : 'HTML'});
    } else if (match[1]) {
      bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, {until_date: tools.duration(match[1], 'date'), can_send_messages: false});
      bot.sendMessage(msg.chat.id, messages.restrictVoice2.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>').replace('$duration', tools.duration(match[1])), {parse_mode : 'HTML'});
    } else {
      bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, {can_send_messages: false});
      bot.sendMessage(msg.chat.id, messages.restrictVoice1.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.d + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
    }
  }
});

// Команда /mute2, лишающая пользователя возможности спамить стикерами, картинками и другим медиа-контентом
bot.onText(/^\/mute2\b ?([^\s]+)? ?(.+)?/, async (msg, match) => {
  if (msg.chat.type == 'supergroup' && msg.reply_to_message && await isAdmin(msg.chat.id, msg.from.id)) {
    if (match[1] && match[2]) {
      bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, {
        until_date: tools.duration(match[1], 'date'), 
        can_send_messages: true,
        can_send_media_messages: false, 
        can_send_other_messages: false,
        can_add_web_page_previews: false
      });
      bot.sendMessage(msg.chat.id, 'За ' + match[2] + ' ' + messages.restrictMedia2.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>').replace('$duration', tools.duration(match[1])), {parse_mode : 'HTML'});
    } else if (match[1]) {
      bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, {
        until_date: tools.duration(match[1], 'date'), 
        can_send_messages: true,
        can_send_media_messages: false, 
        can_send_other_messages: false,
        can_add_web_page_previews: false
      });
      bot.sendMessage(msg.chat.id, messages.restrictMedia2.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>').replace('$duration', tools.duration(match[1])), {parse_mode : 'HTML'});
    } else {
      bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, { 
        can_send_messages: true,
        can_send_media_messages: false, 
        can_send_other_messages: false,
        can_add_web_page_previews: false
      });
      bot.sendMessage(msg.chat.id, messages.restrictMedia1.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
    }
  }
});

// Команда /unmute, снимающая все ограничения
bot.onText(/^\/unmute$/, async (msg, match) => {
  if (msg.chat.type == 'supergroup' && msg.reply_to_message && await isAdmin(msg.chat.id, msg.from.id)) {
     bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, { 
      can_send_messages: true,
      can_send_media_messages: true, 
      can_send_other_messages: true,
      can_add_web_page_previews: true
    });
    bot.sendMessage(msg.chat.id, messages.unRestrict.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
    tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
  }
});

// Команда /kick, изгоняющая злых духов
bot.onText(/^\/kick\b ?(.+)?/, async (msg, match) => {
  if (msg.chat.type == 'supergroup' && msg.reply_to_message && await isAdmin(msg.chat.id, msg.from.id)) {
    var user = await bot.getChatMember(msg.chat.id, msg.reply_to_message.from.id);
    if (user.status == 'member') {
      if (match[1]) {
        bot.kickChatMember(msg.chat.id, msg.reply_to_message.from.id);
        bot.unbanChatMember(msg.chat.id, msg.reply_to_message.from.id);
        bot.sendMessage(msg.chat.id, 'За ' + match[1]+ ' ' + messages.kick.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
        tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
      } else {
        bot.kickChatMember(msg.chat.id, msg.reply_to_message.from.id);
        bot.unbanChatMember(msg.chat.id, msg.reply_to_message.from.id);
        bot.sendMessage(msg.chat.id, messages.kick.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
        tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
      }
    } else {
      bot.sendMessage(msg.chat.id, messages.kickNotFound.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
    }
  }
});

// Команда /ban, изгоняющая и запечатывающая злых духов
bot.onText(/^\/ban\b ?(.+)?/, async (msg, match) => {
  if (msg.chat.type == 'supergroup' && msg.reply_to_message && await isAdmin(msg.chat.id, msg.from.id)) {
    if (match[1]) {
      bot.kickChatMember(msg.chat.id, msg.reply_to_message.from.id);
      bot.sendMessage(msg.chat.id, 'За ' + match[1]+ ' ' + messages.ban.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
    } else {
      bot.kickChatMember(msg.chat.id, msg.reply_to_message.from.id);
      bot.sendMessage(msg.chat.id, messages.ban.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
    }
  }
});

// Команда /del, удаляющая процитированное сообщение
// Если команда вызвана с агрументом, то он выводится как причина удаления
// Удалённые сообщения сохраняются и при запросе высылаются пользователю в приват
bot.onText(/^\/del\b ?(.+)?/, async (msg, match) => {
  if (msg.chat.type == 'supergroup' && msg.reply_to_message && await isAdmin(msg.chat.id, msg.from.id)) {
    forward = await bot.forwardMessage(config.channel, msg.chat.id, msg.reply_to_message.message_id, {disable_notification:true});  
    if (match[1]) {
      report = await bot.sendMessage(msg.chat.id, messages.deleteDel2.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>').replace('$reason', match[1]), {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: 'Показать', callback_data: 'sendDelMsg'}]]}});
    } else {
      report = await bot.sendMessage(msg.chat.id, messages.deleteDel1.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
      tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages.reportBtn, callback_data: 'sendDelMsg'}]]}});
    }
      mongoDeleted.insertOne({reportId: report.message_id, forwardId: forward.message_id});
      bot.deleteMessage(msg.chat.id, msg.reply_to_message.message_id);
    };
});

// Команда /dels, предназначенная для массового удаления сообщений
// Первый аргумент - перечисленые через запятую ID сообщений без пробелов
// Второй агрумент (если указан) выводится как причина удаления
bot.onText(/^\/dels\b (\d+(?:,\d+)+) ?(.+)?/, async (msg, match) => {
  if (await isAdmin(msg.chat.id, msg.from.id)) {  
    var ii = 0, message = '', names = '';
    var usrList = {}, forwList = []; 
    var delList = match[1].split(',');
    for (var i = 0; i < delList.length; i++) {
      forward = await bot.forwardMessage(config.channel, msg.chat.id, delList[i], {disable_notification:true});
      forwList.push(forward.message_id);
      bot.deleteMessage(msg.chat.id, delList[i]);
      var name = '<a href=\"tg://user?id=' + forward.forward_from.id + '/\">' + tools.nameToBeShow(forward.forward_from) + '</a>'
      usrList[name] = (usrList[name] || 0) + 1;
    }
    for (var usr in usrList) {
      ii++;
      if (ii < Object.keys(usrList).length) {
        names += usrList[usr] + ' ' + usr + ', ';
      } else {
        names += usrList[usr] + ' ' + usr;
      }
      if (ii == 1) {
        message =  messages.deleteDels1.replace('$count', tools.msgDecl(usrList[usr])).replace('$name', usr);
      } else if (ii >= 2) {
        message = messages.deleteDels2.replace('$names', names);
      }
    }
    if (match[2]) {
      report = await bot.sendMessage(msg.chat.id, message + ' за ' + match[2] + '.', {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages.reportBtn, callback_data: 'sendDelMsg'}]]}});
    } else {
      report = await bot.sendMessage(msg.chat.id, message + '.', {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages.reportBtn, callback_data: 'sendDelMsg'}]]}});
    }
    mongoDeleted.insertOne({reportId: report.message_id, forwardId: forwList});
  }
});

// Ответ бота на пожелания доброго утра и спокойной ночи
bot.onText(/добр\S* утр\S*|утр\S* добро\S*|^(утра|утречка)(\.|\!)?$/i, (msg) => {
  if (!lastGoodDay) {
    bot.sendMessage(msg.chat.id, tools.random(messages.goodDay));
    lastGoodDay = msg.date;
  } else if (moment().diff(moment.unix(lastGoodDay), 'seconds') >= config.responseTimeout) {
     bot.sendMessage(msg.chat.id, tools.random(messages.goodDay));
     lastGoodDay = msg.date;
  }
});

bot.onText(/спокойной ночи|доброй ночи|приятных снов\S*|доброноч\S*|^(ночки|ночки всем|снов|всем снов)(\.|\!)?$/i, (msg) => {
  if (!lastGoodNight) {
    bot.sendMessage(msg.chat.id, tools.random(messages.goodNight));
    lastGoodNight = msg.date;
  } else if (moment().diff(moment.unix(lastGoodNight), 'seconds') >= config.responseTimeout) {
     bot.sendMessage(msg.chat.id, tools.random(messages.goodNight));
     lastGoodNight = msg.date;
  }
});

// В ответ на вопрос типа "Себастьян, 1 или 2?" случайно выбирается один из перечисленных вариантов.
// На вопросы вроде "Себастьян, чтоугодно?" случайным образом отвечает да/нет.
bot.on('text', (msg) => {
  const answer = msg.text.match(/себастьян(\,)? (.+)\?$/i);
  const answerChoice = msg.text.match(/себастьян(\,)? (.+) или (.+)\?$/i);
  if (answerChoice) {
    var index = Math.floor(Math.random() * 2 + 2);
    bot.sendMessage(msg.chat.id, tools.capitalize(tools.random(messages.answerChoice).replace('$variant', answerChoice[index])));
  } else if (answer) {
    bot.sendMessage(msg.chat.id, tools.random(messages.answer));    
  }
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
  mongoUsers.findOne({userId: msg.new_chat_member.id}, function (err, user) {
    if (!user) {
      bot.sendMessage(msg.chat.id, tools.random(messages.welcomeNew).replace('$name', tools.nameToBeShow(msg.new_chat_member)), {parse_mode : 'markdown'});
      mongoUsers.insertOne({userId: msg.new_chat_member.id, joinDate: msg.date, antiSpam: 1});
    } else {
      if (moment().diff(moment.unix(user.joinDate), 'hours') <= config.joinPeriod) {
        bot.sendMessage(msg.chat.id, tools.random(messages.welcomeRet1).replace('$name', tools.nameToBeShow(msg.new_chat_member)));
        mongoUsers.update({userId: msg.new_chat_member.id}, {$set: {joinDate: msg.date}})
      } else {
        bot.sendMessage(msg.chat.id, tools.random(messages.welcomeRet2).replace('$name', tools.nameToBeShow(msg.new_chat_member)));
        mongoUsers.update({userId: msg.new_chat_member.id}, {$set: {joinDate: msg.date}})
      }
    }
  })
});

// Антиспам, который действует для недавно вошедших в чат участников
// Срабатывает на forward и ссылки типа @username, t.me, telegram.me, удаляя содержащие их сообщения
// Удалённые сообщения сохраняются и при запросе высылаются пользователю в приват
bot.on('message', async (msg) => {
  mongoUsers.findOne({userId: msg.from.id, antiSpam: 1}, async function (err, user) {
    var deleted = false;
    if (user) {
      if (msg.forward_from_chat) {
        deleteSpam(msg);
        deleted = true;
      } else if (msg.text) {
        if (/t(?:elegram)?\.me/.test(msg.text)) {
          deleteSpam(msg);
          deleted = true;
        }
        var entities = msg.entities || [];
        for (var entity of entities) {
          if (entity.type && entity.type == 'mention') {
            var mentioned = msg.text.substr(entity.offset, entity.length);
            try {
              var chat = await bot.getChat(mentioned);
              if (chat && chat.type == 'channel' || chat && chat.type == 'supergroup') {
                deleteSpam(msg);
                deleted = true;
                break;
              }
            } catch(err) {
              console.log('[Antispam] mention check in msg.text fail:', err.message);
            }
          }
        }        
      } else if (msg.caption) {
        if (/t(?:elegram)?\.me/.test(msg.caption)) {
          deleteSpam(msg);   
          deleted = true;
        }  
        var entities = msg.caption_entities || [];
        for (var entity of entities) {
          if (entity.type && entity.type == 'mention') {
            var mentioned = msg.caption.substr(entity.offset, entity.length);
            try {
              var chat = await bot.getChat(mentioned);
              if (chat && chat.type == 'channel' || chat && chat.type == 'supergroup') {
                deleteSpam(msg);
                deleted = true;
                break;
              }
            } catch(err) {
              console.log('[Antispam] mention check in msg.caption fail:', err.message);
            }
          }
        }
      }
      if (deleted == false) {
        mongoUsers.update({userId: msg.from.id}, {$unset: {antiSpam: ''}});
      }
    }
  });
});

// Нажатие на кнопку пересылает сохранённое в канале сообщение пользователю в приват
bot.on('callback_query', async (msg) => {
  if (msg.data === 'sendDelMsg') {
    console.log('[Log]', tools.nameToBeShow(msg.from) + ' (' + msg.from.id + ') pressed the sendDelMsg button under (' + msg.message.message_id + ') bot message');
    mongoDeleted.findOne({reportId: msg.message.message_id}, function (err, find) {
      if (find.forwardId.length) {
        for (var i = 0; i < find.forwardId.length; i++) {
          bot.forwardMessage(msg.from.id, config.channel, find.forwardId[i])
            .then(data => bot.answerCallbackQuery(msg.id, messages.reSend))
            .catch(error => console.log(error.message));
        }
      } else {
        bot.forwardMessage(msg.from.id, config.channel, find.forwardId)
        .then(data => bot.answerCallbackQuery(msg.id, messages.reSend))
        .catch(error => console.log(error.message));
      }
    })
  }
});

bot.on('text', async (msg) => {
  if (msg.chat.type == 'private') console.log('[Log]', tools.nameToBeShow(msg.from) + ' (' + msg.from.id + ') wrote to bot: ' + msg.text);
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
  tools.nameToBeShow(msg.from) + '</a>'), {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages.reportBtn, callback_data: 'sendDelMsg'}]]}});
  mongoDeleted.insertOne({msg, reportId: report.message_id, forwardId: forward.message_id});
  bot.deleteMessage(msg.chat.id, msg.message_id);
};
