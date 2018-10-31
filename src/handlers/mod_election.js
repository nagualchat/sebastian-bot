const moment = require('moment');
const Elections = require('../models/elections');
const Users = require('../models/users');
const tools = require('../tools');
const config = require('../config');

const pollText = 'Пришло время выборов! Голосуйте за того, кто будет модератором в течении следующих двух недель.\n\n' +
  '_Голосование анонимное. Участники выбраны случайным образом из числа активных. Опрос продлится 24 часа, после чего будут объявлены результаты._';
const poll2Text = 'Вот это накал страстей! Несколько кандидатов идут вровень друг с другом. Чтобы выявить победителя, придётся провести ещё один этап голосования.';
const pollEndText = 'Результаты опроса:\n$top\n\nВсего проголосовало: $sum.';
const winnerText = 'Выборы завершились победой $name. Поздравляю!\n\n' +
  'Модераторские полномочия будут активны в течении двух недель. Ознакомиться с доступными в это время командами можно набрав /mod. ' +
  'Пользуйся ими с умом, придерживаясь [правил](https://t.me/nagualchat/35397) чата.';
const winner2Text = 'После напряжённой борьбы выборы неожиданно завершились победой нескольких участников. Поздравляю $names с победой!\n\n' +
  'Модераторские полномочия будут активны в течении двух недель. Ознакомиться с доступными в это время командами можно набрав /mod. ' +
  'Пользуйтесь ими с умом, придерживаясь [правил](https://t.me/nagualchat/35397) чата.';

// Длительность этапов выборов в часах
const collectingTime = 2 * 7 * 24;
const votingTime = 24;
const minCandidates = 2;

module.exports = function(bot) {

  /* Каждый писака добавляется в список кандидатов */
  bot.on('message', async (msg) => {
    if (msg.chat.type == 'supergroup' && msg.text) {
      // $addToSet добавляет в массив только в том случае, если такого элемента ещё не содержит
      var election = await Elections.updateOne({ stage: 'collecting' }, { $addToSet: { candidates: msg.from.id } });
      if (election && election.nModified) console.log('[Выборы] Добавлен кандидат ' + tools.name2show(msg.from) + ' (' + msg.from.id + ')');
    };
  });

  /* Обработка нажатий на кнопки опроса */
  bot.on('callback_query', async (msg) => {
    var member = await bot.getChatMember(msg.message.chat.id, msg.from.id);
    if (member.status == 'left' || member.status == 'kicked') return;

    var matches = msg.data.match(/vote\_(\d+)/);
    if (matches) var vote = parseInt(matches[1]);

    var election = await Elections.findOne({ $or: [{ stage: 'voting' }, { stage: 'voting2' }] });

    for (item of election.pollData) {
      var index = item.voters.indexOf(msg.from.id);
      if (index !== -1) {
        if (item.uid === vote) {
          bot.answerCallbackQuery(msg.id);
          return;
        } else {
          item.voters.splice(index, 1);
        }
      }
    };

    for (item of election.pollData) {
      if (item.uid === vote) {
        item.voters.push(msg.from.id);
      }
    };

    try {
      await election.save();
    } catch (err) { console.log(err) }

    var buttons = election.pollData.map(function(item) {
      var votes = item.voters.length > 0 ? ` — ${item.voters.length}` : '';
      return [{ text: item.name + votes, callback_data: 'vote_' + item.uid }];
    });

    bot.editMessageText(election.stage == 'voting' ? pollText : poll2Text, {
      chat_id: msg.message.chat.id,
      message_id: election.pollMsgId,
      reply_markup: { inline_keyboard: buttons },
      parse_mode: 'markdown'
    }).catch(err => {});
    bot.answerCallbackQuery(msg.id, { text: 'Голос учтён' });

    console.log('[Выборы]', tools.name2show(msg.from) + ' (' + msg.from.id + ') проголосовал за ' + vote);
  });

  /* Проверка кандидатов и создание опроса, если всё окей */
  async function startVoting(election) {
    var candidatesTmp = [];

    // Фильтрация кандидатов от ботов, админов и покинувших группу людей
    await Promise.all(election.candidates.map(async (id) => {
      var candidate = await bot.getChatMember(config.groupId, id).catch(err => { console.log('[Выборы] Кандидат ' + id + ' не найден') });
      //if (candidate && !candidate.user.is_bot && candidate.status === 'member') {
      if (!candidate.user.is_bot && candidate.status === 'member' || candidate.status === 'creator') {
        candidatesTmp.push({ uid: candidate.user.id, name: tools.name2show(candidate.user), voters: [] });
      }
    }));

    if (candidatesTmp.length + 1 < minCandidates) {
      await Elections.updateOne({ stage: 'collecting' }, { $set: { stage: 'archive', stageAt: Date.now() } });
      console.log('[Выборы] Слишком мало кандидатов, голосование отменяется');
      return;
    }

    // Выбор десяти случайных участников
    tools.shuffle(candidatesTmp);
    candidatesTmp = candidatesTmp.slice(0, 10);
    candidatesTmp = tools.sortByAttribute(candidatesTmp, 'name')

    var buttons = candidatesTmp.map(function(item) {
      return [{ text: item.name, callback_data: 'vote_' + item.uid }];
    });
    var pollMessage = await bot.sendMessage(config.groupId, pollText, { parse_mode: 'markdown', reply_markup: { inline_keyboard: buttons } });
    bot.pinChatMessage(config.groupId, pollMessage.message_id);

    await Users.updateMany({}, { $unset: { isMod: 1 } });
    await Elections.updateOne({ stage: 'collecting' }, { $set: { stage: 'voting', stageAt: Date.now(), pollData: candidatesTmp, pollMsgId: pollMessage.message_id } });
  };

  /* Вычисление результатов голосования и назначение выбранного модератора */
  async function endVoting(election) {
    var votesSorted = election.pollData.map(function(item) {
      return { uid: item.uid, name: item.name, votes: item.voters.length };
    });

    // Сортировка сначала по количеству голосов, потом дополнительно по имени
    votesSorted = tools.sortByAttribute(votesSorted, '-votes', 'name')

    // Общее количество голосов
    var sum = votesSorted.reduce((a, b) => +a + +b.votes, 0);

    var top = votesSorted.map(function(item) {
      return `${item.name}  —  ${item.votes}`;
    });

    await bot.unpinChatMessage(config.groupId).catch(err => {});

    bot.editMessageText(pollEndText.replace('$top', top.join('\n')).replace('$sum', tools.declension(sum, 'men')), {
      chat_id: config.groupId,
      message_id: election.pollMsgId,
      parse_mode: 'markdown'
    }).catch(err => {});

    if (votesSorted[0].votes != votesSorted[1].votes) {
      bot.sendMessage(config.groupId, winnerText.replace('$name', '[' + votesSorted[0].name + '](tg://user?id=' + votesSorted[0].uid + ')'), {
        reply_to_message_id: election.pollMsgId,
        parse_mode: 'markdown',
        disable_web_page_preview: 'true'
      });

      await Users.updateOne({ uid: votesSorted[0].uid }, { $set: { isMod: true } });
      await Elections.updateOne({ $or: [{ stage: 'voting' }, { stage: 'voting2' }] }, { $set: { stage: 'archive', stageAt: Date.now() } });
      return;
    };

    var winners = votesSorted.filter(function(item) {
      return votesSorted[0].votes == item.votes;
    });

    if (election.stage == 'voting' && votesSorted[0].votes == votesSorted[1].votes) {
      // Запуск второй стадии голосования
      var buttons = winners.map(function(item) {
        return [{ text: item.name, callback_data: 'vote_' + item.uid }];
      });

      var pollMessage = await bot.sendMessage(config.groupId, poll2Text, {
        reply_to_message_id: election.pollMsgId,
        parse_mode: 'markdown',
        reply_markup: { inline_keyboard: buttons }
      });
      bot.pinChatMessage(config.groupId, pollMessage.message_id);

      await Elections.updateOne({ stage: 'voting' }, { $set: { stage: 'voting2', stageAt: Date.now(), pollData: winners, pollMsgId: pollMessage.message_id }, });
      console.log('[Выборы] Победителей несколько, начинаю вторую стадию голосования');

    } else if (election.stage == 'voting2' && votesSorted[0].votes == votesSorted[1].votes) {
      // Завершение второй стадии голосования
      var names = winners.map(function(item) {
        return `[${item.name}](tg://user?id=${item.uid})`;
      });

      bot.sendMessage(config.groupId, winner2Text.replace('$names', names.join(', ')), {
        reply_to_message_id: election.pollMsgId,
        parse_mode: 'markdown',
        disable_web_page_preview: 'true'
      });

      var uids = winners.map(item => item.uid);
      await Users.updateMany({ uid: { $in: uids } }, { $set: { isMod: true } });
      await Elections.updateOne({ stage: 'voting2' }, { $set: { stage: 'archive', stageAt: Date.now() } });
      console.log('[Выборы] Во второй стадии голосования несколько победителей, модераторами назначаются все');
    }
  };

  /* Цикл, в котором переключаются этапы программы выборов */
  async function сycle() {
    var election = await Elections.findOne({ $or: [{ stage: 'collecting' }, { stage: 'voting' }, { stage: 'voting2' }] });

    if (!election) {
      console.log('[Выборы] Не найдено активной стадии, создаю новую');
      await Elections.create({ stage: 'collecting', stageAt: Date.now() });
      return;
    };

    if (election.stage == 'collecting' && moment().diff(moment(election.stageAt), 'hours') >= collectingTime) {
      startVoting(election);
      console.log('[Выборы] Стадия выявления кандидатов завершёна, начинаю голосование');
    } else if (election.stage == 'voting' && moment().diff(moment(election.stageAt), 'hours') >= votingTime) {
      endVoting(election);
      console.log('[Выборы] Голосование завершено');
    } else if (election.stage == 'voting2' && moment().diff(moment(election.stageAt), 'hours') >= votingTime) {
      endVoting(election);
      console.log('[Выборы] Вторая стадия голосования завершёна');
    }
  };

  сycle();
  setInterval(сycle, 5 * 60 * 1000);
};