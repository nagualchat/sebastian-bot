const TelegramBot = require('node-telegram-bot-api'); 
const MongoClient = require('mongodb').MongoClient;
const moment = require('moment');
const fs = require('fs');

const config = require('./config/config');
const messages = require('./config/messages');
const tools = require('./tools');

var lastGoodDay, lastGoodNight;
var session = {}; 

// Хак для того, чтобы не зависнуть на стадии building во время развёртывания в now
const http = require('http');
http.createServer(function (req, res) {
  res.write('Hello World!');
  res.end();
}).listen(8080);

MongoClient.connect(config.mongoConnectUrl, (err, database) => {
  if (err) {
    console.log('[Log] ошибка подключения к mongo:', err.message);
    return database.close();
  }
  const mongoFavs = database.collection('favorite_messages');
  const mongoLog = database.collection('log_messages');
  const mongoUsers = database.collection('users');
  const mongoDeleted = database.collection('deleted_messages');
  const mongoBooks = database.collection('books');
  
  const bot = new TelegramBot(config.token, {polling: true});
  bot.getMe().then((res) => { botMe = res });
  bot.getChat(config.group).then((res) => { group = res });

  bot.on('polling_error', (err) => {
    if (err.message.match(/502 Bad Gateway/i)) {
      console.log('[Log] EPARSE: Error parsing Telegram response (502 Bad Gateway)');
    } else {
      console.log('[Log]', err.message);
    }
  });

  // Инлайн-поиск по книгам Кастанеды
  bot.on('inline_query', msg => {
    if (msg.query) {
      var offset = parseInt(msg.offset) || 0;
      // explain() возвращает из нутра монги ключевые слова, по которым производится поиск в индексе
      mongoBooks.find({$text: {$search: msg.query}}).explain(function(err, explain){
        mongoBooks.find({$text: {$search: msg.query}}, {score: {$meta: 'textScore'}}).sort({score:{$meta:'textScore'}}).limit(100).toArray((err, res) => {
          var results = res.map(a => {
              return {
                id: a._id,
                type: 'article',
                title: a.book,
                input_message_content: {
                  parse_mode: 'markdown',
                  message_text: `${a.text}\n[${a.book}](${config.booksUrl}/${a.book.replace('—', '-')}.html#L${a.number})`,
                  disable_web_page_preview: true
                // В description помещается около 130 символов
                }, description: tools.truncate(a.text, explain.executionStats.executionStages.parsedTextQuery.terms[0], 120)
              }
            })
            bot.answerInlineQuery(msg.id, results.slice(offset, offset + 5), {next_offset: offset + 5, cache_time: 0, switch_pm_text: tools.showSearchPhrases(results, explain.executionStats.executionStages.parsedTextQuery), switch_pm_parameter: 'search'});
        })
      console.log('[Log]', tools.nameToBeShow(msg.from) + ' ищет', msg.query);
      //console.log(explain.executionStats.executionStages.parsedTextQuery);      
      });
    } else {
      bot.answerInlineQuery(msg.id, [], {cache_time: 0, switch_pm_text: 'Справка', switch_pm_parameter: 'help'});
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
        bot.sendMessage(msg.chat.id,  tools.getRandom(messages.welcomeNew).replace('$name', tools.nameToBeShow(msg.new_chat_member)), {parse_mode : 'markdown'});
        mongoUsers.insertOne({userId: msg.new_chat_member.id, joinDate: msg.date, antiSpam: 1});
      } else {
        if (moment().diff(moment.unix(user.joinDate), 'hours') <= config.joinPeriod) {
          bot.sendMessage(msg.chat.id,  tools.getRandom(messages.welcomeRet1).replace('$name', tools.nameToBeShow(msg.new_chat_member)));
          mongoUsers.update({userId: msg.new_chat_member.id}, {$set: {joinDate: msg.date}})
        } else {
          bot.sendMessage(msg.chat.id,  tools.getRandom(messages.welcomeRet2).replace('$name', tools.nameToBeShow(msg.new_chat_member)));
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
          if (!(msg.document || msg.audio)) {
            deleteSpam(msg);
            deleted = true;
          }
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

  // Ответ бота на пожелания доброго утра и спокойной ночи
  bot.onText(/добр\S* утр\S*|утр\S* добро\S*|^(утра|утречка)(\.|\!)?$/i, (msg) => {
    if (!lastGoodDay) {
      bot.sendMessage(msg.chat.id,  tools.getRandom(messages.goodDay));
      lastGoodDay = msg.date;
    } else if (moment().diff(moment.unix(lastGoodDay), 'seconds') >= config.responseTimeout) {
      bot.sendMessage(msg.chat.id,  tools.getRandom(messages.goodDay));
      lastGoodDay = msg.date;
    }
  });

  bot.onText(/спокойной ночи|приятных снов\S*|доброноч\S*|^(ночки|ночки всем|снов|всем снов)(\.|\!)?$/i, (msg) => {
    if (!lastGoodNight) {
      bot.sendMessage(msg.chat.id,  tools.getRandom(messages.goodNight));
      lastGoodNight = msg.date;
    } else if (moment().diff(moment.unix(lastGoodNight), 'seconds') >= config.responseTimeout) {
      bot.sendMessage(msg.chat.id,  tools.getRandom(messages.goodNight));
      lastGoodNight = msg.date;
    }
  });

  // В ответ на вопрос типа "Себастьян, 1 или 2?" случайно выбирается один из перечисленных вариантов.
  // На вопросы вроде "Себастьян, чтоугодно?" случайным образом отвечает да/нет.
  bot.on('text', (msg) => {
    const answer = msg.text.match(/себастьян(\,)? (.+)\?/i);
    const answerChoice = msg.text.match(/себастьян(\,)? (.+) или (.+)\?/i);
    if (answerChoice) {
      var index = Math.floor(Math.random() * 2 + 2);
      bot.sendMessage(msg.chat.id, tools.capitalize( tools.getRandom(messages.answerChoice).replace('$variant', answerChoice[index])));
    } else if (answer) {
      bot.sendMessage(msg.chat.id,  tools.getRandom(messages.answer));    
    }
  });

  // Начисление очков благодарности
  bot.onText(/плюсую|👍|\+|спасибо|благодарю|спс|thx/i, (msg) => {
    if (msg.reply_to_message && msg.reply_to_message.from.id != msg.from.id && msg.reply_to_message.from.id != botMe.id) {
      mongoUsers.findOne({userId: msg.from.id}, function (err, user) {
        if (!user) {
          console.log('[Log] ' + msg.reply_to_message.from.id + ' начислен плюс (пользователя не существовало)');          
          reputationInc(msg);
          mongoUsers.insertOne({userId: msg.from.id, repIncDate: msg.date});
        } else if (!user.repIncDate) {
          console.log('[Log] ' + msg.reply_to_message.from.id + ' начислен плюс (первый)'); 
          reputationInc(msg);
          mongoUsers.update({userId: msg.from.id}, {$set: {repIncDate: msg.date}});
          // Плюсы не начисляются, если после последнего отправленного не прошло время таймаута
        } else if (moment().diff(moment.unix(user.repIncDate), 'seconds') >= config.reputationTimeout) {
          reputationInc(msg);
          console.log('[Log] ' + msg.reply_to_message.from.id + ' начислен плюс'); 
          mongoUsers.update({userId: msg.from.id}, {$set: {repIncDate: msg.date}});
        }
      })
    }
  });

  // Команда /top
  bot.onText(/^\/top\b/, (msg) => {
    mongoUsers.find({repPoints: {$gte: 1}}).limit(20).sort({repPoints: -1}).toArray(async function(err, users) {
      var s = [];
      for (let user of users) {
        var success = true;
        try {
          var inf = await bot.getChatMember(config.group, user.userId);
        } catch(err){
          success = false;
        }
        if(success != false) {
          s.push(tools.nameToBeShow(inf.user) + ': ' + user.repPoints);
        }
      };
       bot.sendMessage(msg.chat.id, messages.repTop + s.join('\n'), {parse_mode: 'HTML', disable_web_page_preview: 'true'});
    })
  });

  // Команда /buy, отображающая накопленные плюсы
  bot.onText(/^\/buy\b/, (msg) => {
    if (msg.chat.type == 'supergroup') {
      mongoUsers.findOne({userId: msg.from.id}, function (err, user) {
        if (!user || user.repPoints == undefined) user.repPoints = 0;
        bot.sendMessage(msg.chat.id, messages.repStore.replace('$name', tools.nameToBeShow(msg.from)).replace('$points', tools.declension(user.repPoints, 'plus')), {parse_mode : 'markdown', reply_markup: {inline_keyboard: [[{text: 'Цитата', callback_data: 'buy_quote_' + msg.from.id}, {text: 'Шутка', callback_data: 'buy_joke_' + msg.from.id}]]}});
      })
    } else bot.sendMessage(msg.chat.id, 'Эта команду следует вызывать в общем чате.');
  });
  
  // Команда \gift для дарения плюсов другому участнику
  bot.onText(/^\/gift\b ?(.+)?/, (msg, match) => {
    if (msg.chat.type == 'supergroup' && msg.reply_to_message && msg.reply_to_message.from.id != msg.from.id && msg.reply_to_message.from.id != botMe.id && match[1]) {
      var gift = Number(match[1]);
      // Если достаточное количество плюсов есть на счету отправителя, они снимаются
      mongoUsers.findOne({userId: msg.from.id}, function (err, user) {
        if (user && user.repPoints && user.repPoints >= gift) {
        bot.sendMessage(msg.chat.id, messages.giftMessage.replace('$name', tools.nameToBeShow(msg.from)).replace('$points', tools.declension(gift, 'plus')).replace('$name2', tools.nameToBeShow(msg.reply_to_message.from)));
        mongoUsers.update({userId: msg.from.id}, {$set: {repPoints: user.repPoints-gift}});
        // И начисляются на счёт получателя
        mongoUsers.findOne({userId: msg.reply_to_message.from.id}, function (err, user) {
          if (!user) {
            mongoUsers.insertOne({userId: msg.reply_to_message.from.id, repPoints: gift});
          } else if (!user.repPoints) {
            mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {repPoints: gift}})
          } else {
            mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {repPoints: user.repPoints+gift}});
          }
        })
      } else {
        bot.sendMessage(msg.chat.id, messages.buyNotEnough.replace('$name', tools.nameToBeShow(msg.from)).replace('$points', user.repPoints));  
      }
    })
    }
  });

  // Команда /pin, прикрепляющая сообщение за плюсы
  bot.onText(/^\/pin\b/, (msg) => {
    if (msg.chat.type == 'supergroup' && msg.reply_to_message && msg.reply_to_message.from.id != botMe.id) {
      mongoUsers.findOne({userId: msg.from.id}, function (err, user) {
        if (user && user.repPoints && user.repPoints >= messages.pinPrice) {
          bot.sendMessage(msg.chat.id, messages.pinMessage.replace('$name', tools.nameToBeShow(msg.from)).replace('$price', tools.declension(messages.pinPrice, 'plus')).replace('$points', user.repPoints-messages.pinPrice));          
          mongoUsers.update({userId: msg.from.id}, {$set: {repPoints: user.repPoints-messages.pinPrice}});
          bot.pinChatMessage(config.group, msg.reply_to_message.message_id);
        } else {
          bot.sendMessage(msg.chat.id, messages.buyNotEnough.replace('$name', tools.nameToBeShow(msg.from)).replace('$points', user.repPoints));  
        }
      })
    }
  });

  // Вывод справок
  bot.onText(/^\/start\b/, (msg) => {
    if (msg.chat.type == 'private') bot.sendMessage(msg.chat.id, messages.help, {parse_mode : 'markdown', disable_web_page_preview: 'true'});
  });

  bot.onText(/^\/help\b/, (msg) => {
    bot.sendMessage(msg.chat.id, messages.help, {parse_mode : 'markdown', disable_web_page_preview: 'true'});
  });

  bot.onText(/^\/ahelp\b/, (msg) => {
    bot.sendMessage(msg.chat.id, messages.ahelp, {parse_mode : 'markdown', disable_web_page_preview: 'true'});
  });

  // Команда /say, отправляющая сообщение в группу от лица бота
  bot.onText(/^\/say (.+)/, async (msg, match) => {
    if (msg.chat.type == 'private' &&  await memberStatus(config.group, msg.from.id) == 'admin') {
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
    if (match[1] && match[2] && await memberStatus(config.group, msg.from.id) == 'admin') {
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

  // Команда /d, удаляющая закладку
  bot.onText(/^\/d\b ?(.+)?/, async (msg, match) => {
    if (match[1] && await memberStatus(config.group, msg.from.id) == 'admin') {
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

  // Команда /mod, предназначенная для управлением модераторами
  bot.onText(/^\/mod\b/, async (msg, match) => {
    if (msg.reply_to_message) {
      if (msg.chat.type == 'supergroup' && await memberStatus(config.group, msg.from.id) == 'admin') {
        mongoUsers.findOne({userId: msg.reply_to_message.from.id}, function (err, user) {
          if (!user) {
            mongoUsers.insertOne({userId: msg.reply_to_message.from.id, mod: true});
            bot.sendMessage(msg.chat.id, messages.modAdd.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
            tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
          } else if (!user.mod){
            mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {mod: true}})
            bot.sendMessage(msg.chat.id, messages.modAdd.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
            tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
          } else {
            mongoUsers.update({userId: msg.reply_to_message.from.id}, {$unset: {mod: ''}});
            bot.sendMessage(msg.chat.id, messages.modDel.replace('$username', '<a href=\"tg://user?id=' + msg.reply_to_message.from.id + '/\">' + 
            tools.nameToBeShow(msg.reply_to_message.from) + '</a>'), {parse_mode : 'HTML'});
          }
        })
      }
    } else { // Выводит списов модов, если нет цитирования
      mongoUsers.find({mod: true}).toArray(async function(err, mods) {
        var s = [];
        for (let mod of mods) {
          var inf = await bot.getChatMember(config.group, mod.userId);
          s.push(tools.nameToBeShow(inf.user));
        }
        bot.sendMessage(msg.chat.id, messages.modList + s.join('\n'), {parse_mode : 'HTML', disable_web_page_preview: 'true'});
      })
    }
  });

  bot.onText(/^\//, (msg, match) => {
    if (msg.chat.type == 'private') console.log('[Log]', tools.nameToBeShow(msg.from) + ' (' + msg.from.id + ') ввёл команду: ' + msg.text);
  });

  // Запись всех сообщений чата в базу данных
  bot.on('message', (msg) => {
    if (msg.chat.type == 'supergroup') {
    // Названия полей, содержащих date и uid отлючаются в зависисимости от того, написано сообщение в чате, переслано из канала или из другого чата
    // Перед записью всё это приводится к одному формату, чтобы избежать сложностей с поиском в дальнейшем    
      var from = {};
      if (msg.forward_from_chat) {
        if (msg.from.last_name) {
          from = {'id' : msg.from.id, 'first_name' : msg.from.first_name, 'last_name' : msg.from.last_name};
        } else {
          from = {'id' : msg.from.id, 'first_name' : msg.from.first_name};
        }
        if (msg.text) {
          mongoLog.insertOne({message_id: msg.message_id, from: from, 'chat' : msg.forward_from_chat.id, 'date' : msg.forward_date, 'text' : msg.text});
        } else {
          mongoLog.insertOne({message_id: msg.message_id, from: from, 'chat' : msg.forward_from_chat.id, 'date' : msg.forward_date,});
        }
      } else if (msg.forward_from) {
          if (msg.from.last_name) {
            from = {'id' : msg.from.id, 'first_name' : msg.from.first_name, 'last_name' : msg.from.last_name};
          } else {
            from = {'id' : msg.from.id, 'first_name' : msg.from.first_name};
          }
          if (msg.text) {
            mongoLog.insertOne({message_id: msg.message_id, from: from, 'date' : msg.forward_date, 'text' : msg.text});
          } else {
            mongoLog.insertOne({message_id: msg.message_id, from: from, 'date' : msg.forward_date});
          }
      } else {
        if (msg.from.last_name) {
          from = {'id' : msg.from.id, 'first_name' : msg.from.first_name, 'last_name' : msg.from.last_name};
        } else {
          from = {'id' : msg.from.id, 'first_name' : msg.from.first_name};
        }
        if (msg.text) {
          mongoLog.insertOne({message_id: msg.message_id, from: from, 'date' : msg.date, 'text' : msg.text});
        } else {
          mongoLog.insertOne({message_id: msg.message_id, from: from, 'date' : msg.date});
        }
      }
    }
  });

  // Обработка форвард-сообщений, отправленных боту в приват
  // Cоздаёт массив данных { 'ID модератора': { toDel : [ { message_id, from: { id, first_name} } ], userId, userLink, timer, recTime } }
  bot.on('message', async (msg) => {
    if (msg.chat.type == 'private') {
      if (msg.forward_from || msg.forward_from_chat) {
        if (await memberStatus(config.group, msg.from.id) == 'admin' || 'moderator') {
          // У форварда из чата и канала названия необходимых для поиска свойств различаются
          var uid, ss = {};
          if (msg.forward_from) {
            uid = msg.forward_from.id;
            ss = {'from.id': msg.forward_from.id, 'date': msg.forward_date};
          } else if (msg.forward_from_chat) {
            uid = msg.from.id;
            ss = {'chat': msg.forward_from_chat.id, 'date': msg.forward_date};
          }
          if (!session[msg.from.id]) {
            if (Object.keys(session).length > 1) {
              console.log('[Log] при открытой сессии создана ещё одна');
            }
            session[msg.from.id] = {timer : setInterval(checkRecTime, 1000, msg), toDel: [], userId: []};
            console.log('[Log] Сессия ' + msg.from.id + ' (' + tools.nameToBeShow(msg.from) + ') создана');            
          } 
            // Форвард-объекты не содержат в себе message_id оригинального сообщения
            // Получаем их из записанных логов чата, для этого ищём по uid написавшего и дате
            mongoLog.find(ss).toArray(function(err, found) {
              if(found.length === 0 || err){
                console.log('[Log] сообщение не найдено в mongoLog или ошибка ('+err+')');
              } else {
              // Дата может оказаться одинаковой, если сообщения отправлены очень быстро одно за другим
              // В таком случае записывается message_id всех найденных постов
                if (found.length > 1) {
                  for (var i = 0; i < found.length; i++) {
                    if (!session[msg.from.id].toDel.find(o => o.message_id == found[i].message_id)) {
                      session[msg.from.id].toDel.push({'message_id': found[i].message_id, 'from': {'id': uid, 'first_name': found[i].from.first_name}});
                    }
                    session[msg.from.id].recTime = msg.date;
                  }
                  console.log('[Log] поиск по пересланным сообщениям вернул несколько результатов (одинаковый uid и date)');   
                } else {
                  session[msg.from.id].toDel.push({'message_id': found[0].message_id, 'from': {'id': uid, 'first_name': found[0].from.first_name}});
                  session[msg.from.id].recTime = msg.date;
                }
                // В userId сохраняются uid авторов сообщений
                if (session[msg.from.id].userId.indexOf(uid) === -1) session[msg.from.id].userId.push(uid);
                // Если автор один, то в userLink помещается имя со ссылкой на профиль (на более поздних этапах создать её будет невозможно)
                if (session[msg.from.id].userId.length == 1) session[msg.from.id].userLink = '<a href=\"tg://user?id=' + uid + '/\">' + tools.nameToBeShow(found[0].from) + '</a>';
              }
            })
          }
      }
    }
  });

  // Когда окончена пересылка сообщений боту, процесс приёма останавливается
  // Бот спрашивает что с этими сообщениями делать - удалить или ограничить пользователя (если сообщения пренадлежат одному)
  // В session добавляется объект botMsg, содержащий сообщение с вопросом бота
  async function checkRecTime(msg) {
    if (moment().diff(moment.unix(session[msg.from.id].recTime), 'seconds') >= 2) {
      if (session[msg.from.id].userId.length == 1) {
        session[msg.from.id].botMsg = await bot.sendMessage(msg.chat.id, 'Удалить сообщения или ограничить права участника?\n', {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: 'Удалить', callback_data: 'delete'}, 
        {text: 'Ограничить', callback_data: 'restrict'}, {text: 'Отменить', callback_data: 'cancel'}]]}});
        sessionTimeout(msg);
      } else {
        session[msg.from.id].botMsg = await bot.sendMessage(msg.chat.id, 'Удалить сообщения?\n', {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: 'Удалить', callback_data: 'delete'}, 
        {text: 'Отменить', callback_data: 'cancel'}]]}});
        sessionTimeout(msg);
      }
      session[msg.from.id].recTime = undefined;
      clearInterval(session[msg.from.id].timer);
    }
  }

  // Обработка нажатий на кнопки
  bot.on('callback_query', (msg) => {
    switch (msg.data) {
    // Обработчик кнопки, пересылающей сохранённое в канале сообщение пользователю в приват
    case 'send_del_msg':
      mongoDeleted.findOne({reportId: msg.message.message_id}, async function (err, find) {
        console.log('[Log]', tools.nameToBeShow(msg.from) + ' (' + msg.from.id + ') запросил удалённое сообщение ' + find.forwardId);      
        if (find.forwardId.length) {
          for (var i = 0; i < find.forwardId.length; i++) {
            var success = true;
              try {
                await bot.forwardMessage(msg.from.id, config.channel, find.forwardId[i]);
              } catch(err) {
                success = false;
                bot.answerCallbackQuery(msg.id, messages.reSendErr, true);
                console.log('[Log] доставить сообщение не удалось (' + err.message + ')');
              }
              if(success != false) {
                bot.answerCallbackQuery(msg.id, messages.reSend);
              }
          }
        } else { 
          // Для совместимости со старыми удалениями (тогда find.forwardId не был массивом)
          try {
            await bot.forwardMessage(msg.from.id, config.channel, find.forwardId);
          } catch(err) {
            success = false;
            bot.answerCallbackQuery(msg.id, messages.reSendErr, true);
            console.log('[Log] доставить сообщение не удалось (' + err.message + ')');
          }
          if(success != false) {
            bot.answerCallbackQuery(msg.id, messages.reSend);
          }
        }
      });
      break;
      // Меню магазина
      case /buy_quote_/.test(msg.data) && msg.data:
        var id = msg.data.match(/buy_quote_(.*)/i);
        if (msg.from.id != id[1]) {
          bot.answerCallbackQuery(msg.id, messages.storeWrongId);
          break;
        }
        mongoUsers.findOne({userId: msg.from.id}, function (err, user) {
          if (user && user.repPoints && user.repPoints >= messages.quotePrice) {
            fs.readFile('./texts/wheel.txt', 'utf8', function(err, data){
              var lines = data.split('\n\n');
              bot.editMessageText(messages.buyComplete.replace('$name', tools.nameToBeShow(msg.from)).replace('$price', tools.declension(messages.quotePrice, 'plus')).replace('$thing', 'цитата').replace('$points', user.repPoints-messages.quotePrice), {chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode : 'markdown'});
              bot.sendMessage(config.group, tools.getRandom(lines),{reply_to_message_id: msg.message.message_id});
            });
            mongoUsers.update({userId: msg.from.id}, {$set: {repPoints: user.repPoints-messages.quotePrice}});
          } else bot.answerCallbackQuery(msg.id, messages.buyNotEnough);
        });
        break;
      case /buy_joke_/.test(msg.data) && msg.data:
        var id = msg.data.match(/buy_joke_(.*)/i);
        if (msg.from.id != id[1]) {
          bot.answerCallbackQuery(msg.id, messages.storeWrongId);
          break;
        }
        mongoUsers.findOne({userId: msg.from.id}, function (err, user) {
          if (user && user.repPoints && user.repPoints >= messages.jokePrice) {
            fs.readFile('./texts/jokes.txt', 'utf8', function(err, data){
              var lines = data.split('\n\n');
              bot.editMessageText(messages.buyComplete.replace('$name', tools.nameToBeShow(msg.from)).replace('$price', tools.declension(messages.jokePrice, 'plus')).replace('$thing', 'шутка').replace('$points', user.repPoints-messages.jokePrice), {chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode : 'markdown'});
              bot.sendMessage(config.group, tools.getRandom(lines),{reply_to_message_id: msg.message.message_id});
            });
            mongoUsers.update({userId: msg.from.id}, {$set: {repPoints: user.repPoints-messages.jokePrice}});
          } else bot.answerCallbackQuery(msg.id, messages.buyNotEnough);
        });
        break;
      // Меню, высылаемое админу в приват при срабатывании антиспама
      case /antispam_(.*)_kick_/.test(msg.data) && msg.data:
        var id = msg.data.match(/antispam_(.*)_kick_(.*)/i);
        bot.kickChatMember(config.group, id[2]);
        bot.unbanChatMember(config.group, id[2]);
        bot.editMessageText(messages.kick.replace('$username', id[2]), {chat_id: config.admin, message_id: id[1]});        
        break;
      case /antispam_(.*)_ban_/.test(msg.data) && msg.data:
        var id = msg.data.match(/antispam_(.*)_ban_(.*)/i);
        bot.kickChatMember(config.group, id[2]);
        bot.editMessageText(messages.ban.replace('$username', id[2]), {chat_id: config.admin, message_id: id[1]});        
        break;
      case /antispam_(.*)_cancel/.test(msg.data) && msg.data:
        var id = msg.data.match(/antispam_(.*)_/i);
        bot.editMessageText(messages.menuCancel, {chat_id: config.admin, message_id: id[1]});
        break;
      // Кнопки меню, выводящегося при получении форвард-сообщений
      case 'delete':
        bot.editMessageText(messages.menuDelete, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, reply_markup: {inline_keyboard: messages.btnDelete}});
        session[msg.from.id].mode = 'waiting_delete_reason';
        sessionTimeout(msg);
        break;
      case /delete_/.test(msg.data) && msg.data:
        var match = msg.data.match(/delete_(.*)/i);
        del(msg, tools.menuReason(match));
        break;
      case 'restrict':
        bot.editMessageText(messages.menuRestrict, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, reply_markup: {inline_keyboard: messages.btnRestrict}, parse_mode : 'markdown'});
        sessionTimeout(msg);
        break;
      case 'mute_voice':
        bot.editMessageText(messages.menuMute, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, reply_markup: {inline_keyboard: messages.btnMute1Duration}});
        sessionTimeout(msg);
        break;
      case /mute_voice\((.*)\)/.test(msg.data) && msg.data:
        var duration = msg.data.match(/mute_voice\((.*)\)/i);
        mute(msg, 'voice', duration[1]);
        break;
      case 'mute_media':
        bot.editMessageText(messages.menuMute, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, reply_markup: {inline_keyboard: messages.btnMute2Duration}});
        sessionTimeout(msg);
        break;
      case /mute_media\((.*)\)/.test(msg.data) && msg.data:
        var duration = msg.data.match(/mute_media\((.*)\)/i);
        mute(msg, 'media', duration[1]);
        break;
      case 'kick':
        bot.editMessageText(messages.menuKick, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, reply_markup: {inline_keyboard: messages.btnKickReason}});
        session[msg.from.id].mode = 'waiting_kick_reason';
        sessionTimeout(msg);
        break;
      case 'ban':
        bot.editMessageText(messages.menuKick, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, reply_markup: {inline_keyboard: messages.btnBanReason}});
        session[msg.from.id].mode = 'waiting_ban_reason';
        sessionTimeout(msg);
        break;
      case /kick_/.test(msg.data) && msg.data:
        var match = msg.data.match(/kick_(.*)/i);
        kick(msg, 'kick', tools.menuReason(match));
        break;
      case /ban_/.test(msg.data) && msg.data:
        var match = msg.data.match(/ban_(.*)/i);
        kick(msg, 'ban', tools.menuReason(match));
        break;
      case 'cancel':
        bot.editMessageText(messages.menuCancel, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id});
        kickSession(msg);
        break;
    }
  });

  // Ожидание ввода кастомной причины удаления, кика или бана
  bot.on('message', (msg) => {
    if (session[msg.from.id] && session[msg.from.id].mode == 'waiting_delete_reason') {
      session[msg.from.id].mode == '';
      del(msg, msg.text);
    } else if (session[msg.from.id] && session[msg.from.id].mode == 'waiting_kick_reason') {
      session[msg.from.id].mode == '';
      kick(msg, 'kick', msg.text);
    } else if (session[msg.from.id] && session[msg.from.id].mode == 'waiting_ban_reason') {
      session[msg.from.id].mode == '';
      kick(msg, 'ban', msg.text);
    }
  });

  // Конечная функция кика/бана
  async function kick(msg, mode, reason) {
    var user = await bot.getChatMember(config.group, session[msg.from.id].userId[0]);
    if (user.status == 'member') {
      if (mode == 'kick') {
        bot.kickChatMember(config.group, session[msg.from.id].userId[0]);
        bot.unbanChatMember(config.group, session[msg.from.id].userId[0]);
        bot.sendMessage(config.group, 'За ' + reason + ' ' + messages.kick.replace('$username', session[msg.from.id].userLink), {parse_mode : 'HTML'});
        bot.sendMessage(config.channel, 'Модератор <a href=\"tg://user?id=' + msg.from.id + '/\">' + tools.nameToBeShow(msg.from) + '</a> выгнал участника ' + session[msg.from.id].userLink + ' за ' + reason + '.', {parse_mode : 'HTML'}); 
        bot.editMessageText('Участник ' + session[msg.from.id].userLink + ' изгнан из чата за ' + reason + '.', {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, parse_mode : 'HTML'});
      } else if (mode == 'ban') {
        bot.kickChatMember(config.group, session[msg.from.id].userId[0]);
        bot.unbanChatMember(config.group, session[msg.from.id].userId[0]);
        bot.sendMessage(config.group, 'За ' + reason + ' ' + messages.ban.replace('$username', session[msg.from.id].userLink), {parse_mode : 'HTML'});
        bot.sendMessage(config.channel, 'Модератор <a href=\"tg://user?id=' + msg.from.id + '/\">' + tools.nameToBeShow(msg.from) + '</a> забанил участника ' + session[msg.from.id].userLink + ' за ' + reason + '.', {parse_mode : 'HTML'}); 
        bot.editMessageText('Участник ' + session[msg.from.id].userLink + ' заблокирован за ' + reason + '.', {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, parse_mode : 'HTML'});
      }
    } else {
      bot.editMessageText(messages.fail, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, parse_mode : 'HTML'});
    }
    kickSession(msg);
  };

  // Конечная функция, блокирующая участнику возможность оправлять в чат сообщения
  async function mute(msg, mode, duration) {
    var user = await bot.getChatMember(config.group, session[msg.from.id].userId[0]);
    if (user.status == 'member') {
      if (mode == 'voice') {
        bot.restrictChatMember(config.group, session[msg.from.id].userId[0], {
        until_date: tools.dconvert(duration, 'date'), 
        can_send_messages: false
        });
        bot.sendMessage(config.group, messages.restrictVoice.replace('$username', session[msg.from.id].userLink).replace('$duration', tools.dconvert(duration)), {parse_mode : 'HTML'});
        bot.sendMessage(config.channel, 'Модератор <a href=\"tg://user?id=' + msg.from.id + '/\">' + tools.nameToBeShow(msg.from) + '</a> запретил участнику ' + session[msg.from.id].userLink + ' отправлять сообщения. Длительность: ' + tools.dconvert(duration) + '.', {parse_mode : 'HTML'}); 
        bot.editMessageText('Участнику ' + session[msg.from.id].userLink + ' запрещено отправлять сообщения. Длительность: ' + tools.dconvert(duration) + '.', {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, parse_mode : 'HTML'});
      } else if (mode == 'media') {
        bot.restrictChatMember(config.group, session[msg.from.id].userId[0], {
        until_date: tools.dconvert(duration, 'date'), 
        can_send_messages: true, 
        can_send_media_messages: false, 
        can_send_other_messages: false, 
        can_add_web_page_previews: false
        });
        bot.sendMessage(config.group, messages.restrictMedia.replace('$username', session[msg.from.id].userLink).replace('$duration', tools.dconvert(duration)), {parse_mode : 'HTML'});
        bot.sendMessage(config.channel, 'Модератор <a href=\"tg://user?id=' + msg.from.id + '/\">' + tools.nameToBeShow(msg.from) + '</a> запретил участнику ' + session[msg.from.id].userLink + ' отправлять медиа-сообщения. Длительность: ' + tools.dconvert(duration) + '.', {parse_mode : 'HTML'}); 
        bot.editMessageText('Участнику ' + session[msg.from.id].userLink + ' запрещено отправлять медиа-сообщения. Длительность: ' + tools.dconvert(duration) + '.', {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, parse_mode : 'HTML'});
      }
    } else {
      bot.editMessageText(messages.fail, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, parse_mode : 'HTML'});
    }
    kickSession(msg);
  };

  // Конечная функция удаления сообщений
  async function del(msg, reason) {
    var report, forward;
    var ii = 0, message = '', names = '', error = '';
    var usrList = {}, forwList = [];
    session[msg.from.id].toDel.sort(tools.compareNumeric);   // Сортировка для последовательного удаления
    if (session[msg.from.id].toDel.length > 10) {
      bot.editMessageText('Не больше 10 сообщений за раз.', {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id});
      clearTimeout(session[msg.from.id].timeout);
      delete session[msg.from.id];
      console.log('[Log] Сессия ' + msg.from.id + ' сброшена');
      return;
    }
    // Каждое сообщение из списка пересылается в канал и удаляется из чата
    // Если одно из сообщений не получается отправить в канал, то скорее всего оно было кем-то удалено пока модератор нажимал на кнопочки
    for (var i = 0; i < session[msg.from.id].toDel.length; i++) {
      try {
        forward = await bot.forwardMessage(config.channel, config.group, session[msg.from.id].toDel[i].message_id, {disable_notification:true});
        forwList.push(forward.message_id);
      } catch(err) {
        console.log('[Log] отправка в канал удаляемого сообщения ' + session[msg.from.id].toDel[i].message_id + ' завершилось ошибкой:', err.message);
        if (err.message.match(/400 Bad Request/i)) {
          error = 'одно из удаляемых сообщений не найдено';
        } else {
          error = err.message;
        }
        break;
      }
        var name = '<a href=\"tg://user?id=' + session[msg.from.id].toDel[i].from.id + '/\">' + tools.nameToBeShow(session[msg.from.id].toDel[i].from) + '</a>';
        usrList[name] = (usrList[name] || 0) + 1;
    }
    // Если ошибка при отправке в канал не возникала, сообщения удаляются из чата
      if (!error) {
        for (var i = 0; i < session[msg.from.id].toDel.length; i++) {
          try {
            await bot.deleteMessage(config.group, session[msg.from.id].toDel[i].message_id);
          } catch(err) {
            console.log('[Log] удаление сообщения ' + session[msg.from.id].toDel[i].message_id + ' завершилось ошибкой:', err.message);    
          }
        }
      } else {
        // Или не удаляются; таком случае нужно убрать те сообщения, которые в канал всё таки ушли
        for (var i = 0; i < forwList.length; i++) {
          try {
            await bot.deleteMessage(config.channel, forwList[i]);
          } catch(err) {
            console.log('[Log] удаление сообщения ' + session[msg.from.id].toDel[i].message_id + ' завершилось ошибкой:', err.message);    
          }
        }
      }
    // По содержимому usrList[] составляется отчёт о том, сколько чьих сообщений было удалено
    for (var usr in usrList) {
      ii++;
      if (ii < Object.keys(usrList).length) {
        names += usrList[usr] + ' ' + usr + ', ';
      } else {
        names += usrList[usr] + ' ' + usr;
      }
      if (ii == 1) {
        message =  messages.deleteDel1.replace('$count', tools.declension(usrList[usr], 'message')).replace('$name', usr).replace('$reason', reason);
      } else if (ii >= 2) {
        message = messages.deleteDel2.replace('$names', names).replace('$reason', reason);
      }
    } 
    // Если ошибка при отправке в канал не возникала, то высылаются информационные сообщения о произведённом удалении
    if (!error) {
      report = await bot.sendMessage(config.group, message, {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages. btnShowDeleted, callback_data: 'send_del_msg'}]]}});
      mongoDeleted.insertOne({reportId: report.message_id, forwardId: forwList});      
      bot.sendMessage(config.channel, '<a href="http://t.me/' + group.username + '/' + report.message_id + '">' + '[←]' + '</a> ' + message + ' Модератор: <a href=\"tg://user?id=' + msg.from.id + '/\">' + tools.nameToBeShow(msg.from) + '</a>.', {parse_mode : 'HTML', disable_web_page_preview: 'true'});
      bot.editMessageText(message, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id, parse_mode : 'HTML'});
    } else {
      bot.editMessageText('Операция отменена из-за ошибки (' + error + '). Попробуйте заново.', {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id});
    }
    kickSession(msg);
  };

  // Фнкции, завершающие старые сессии
  function sessionTimeout(msg, mode) {
    clearTimeout(session[msg.from.id].timeout);
    session[msg.from.id].timeout = setTimeout(function kickSession(msg) { 
      bot.editMessageText(messages.sessionOutd, {chat_id: session[msg.from.id].botMsg.chat.id, message_id: session[msg.from.id].botMsg.message_id});  
      delete session[msg.from.id];
      console.log('[Log] Сессия ' + msg.from.id + ' сброшена таймером');
    }, config.sessionLifeTime, msg);
  }

  function kickSession(msg) {
    clearTimeout(session[msg.from.id].timeout);
    delete session[msg.from.id];
    console.log('[Log] Сессия ' + msg.from.id + ' завершена');
  }

  // Функция проверяет, является ли пользователь админом или модератором
  const memberStatus = async (chatId, userId) => {
    var mods = await mongoUsers.findOne({userId: userId, mod: true});
    var admins = await bot.getChatAdministrators(chatId);
      if (mods) {
        return 'moderator';
      } else if (admins.filter(x => x.user.id == userId).length > 0) {
          return 'admin';
      } else {
        return 'user';
      }
  };

  // Функция удаления сообщений для антиспама
  // Перед удалением сообщение пересылается в канал на хранение
  const deleteSpam = async (msg) => {
    var report, areport, forward;
    forward = await bot.forwardMessage(config.channel, msg.chat.id, msg.message_id, {disable_notification:true});
    report = await bot.sendMessage(msg.chat.id, messages.deleteSpam.replace('$username', '<a href=\"tg://user?id=' + msg.from.id + '/\">' + 
    tools.nameToBeShow(msg.from) + '</a>'), {parse_mode : 'HTML', reply_markup: {inline_keyboard: [[{text: messages. btnShowDeleted, callback_data: 'send_del_msg'}]]}});
    mongoDeleted.insertOne({msg, reportId: report.message_id, forwardId: forward.message_id});
    bot.deleteMessage(msg.chat.id, msg.message_id);
    // Меню, высылаемое админу в приват при срабатывании антиспама
    areport = await bot.sendMessage(config.admin, 'Антиспам сработал');
    await bot.editMessageText('Антиспам сработал на сообщение <a href="http://t.me/chatbotlog/' + forward.message_id + '">' + report.message_id + '</a>. Что сделать с отправившим?', {chat_id: areport.chat.id, message_id: areport.message_id, parse_mode : 'HTML', disable_web_page_preview: 'true', reply_markup: {inline_keyboard: [[{text: 'Выгнать', callback_data: 'antispam_' + areport.message_id + '_kick_' + msg.from.id}, {text: 'Забанить', callback_data: 'antispam_' + areport.message_id + '_ban_' + msg.from.id}, {text: 'Ничего', callback_data: 'antispam_' + areport.message_id + '_cancel'}]]}});
  }

  // Функция начисления очков благодарности
  function reputationInc(msg) {
    mongoUsers.findOne({userId: msg.reply_to_message.from.id}, function (err, user) {        
      if (!user) {
        mongoUsers.insertOne({userId: msg.reply_to_message.from.id, repPoints: 1});
      } else if (!user.repPoints) {
        mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {repPoints: 1}})
      } else {
        var count = user.repPoints + 1;
        mongoUsers.update({userId: msg.reply_to_message.from.id}, {$set: {repPoints: count}})
      }
    })
  };

});
