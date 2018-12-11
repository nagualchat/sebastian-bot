const moment = require('moment');
const Elections = require('../models/elections');
const Users = require('../models/users');
const tools = require('../tools');
const config = require('../config');

const pollText = 'Пришло время выбирать того, кто будет модератором в течении следующих двух недель.\n\n' +
  '_Голосование анонимное. Участники выбраны случайным образом из числа активных. Опрос продлится 24 часа, после чего будут объявлены результаты. ' +
  'На данный момент проголосовало $sum._';
const pollEndText = 'Результаты выборов:\n$top\n\nВсего проголосовало: $sum.';
const winnerText = 'Выборы завершились победой $name. Поздравляю!';
const refText = '\n\nМодераторские полномочия будут активны в течении двух недель. Ознакомиться с доступными в это время командами можно набрав /mod. ' +
'Пользуйтесь ими с умом, придерживаясь [правил](https://t.me/nagualchat/35397) чата.';

// Длительность этапов выборов в часах
const collectingTime = 2 * 7 * 24;
const votingTime = 24;
const minCandidates = 1;

module.exports = async function(bot) {

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
    if (msg.data && /vote_/.test(msg.data)) {
      var member = await bot.getChatMember(msg.message.chat.id, msg.from.id);
      if (member.status == 'left' || member.status == 'kicked') return;

      var matches = msg.data.match(/vote\_(\d+)/);
      if (matches) var vote = parseInt(matches[1]);

      var election = await Elections.findOne({ stage: 'voting' });

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

      // Общее количество голосов
      var votes = election.pollData.map(function(item) {
        return { uid: item.uid, name: item.name, votes: item.voters.length };
      });
      var sum = votes.reduce((a, b) => +a + +b.votes, 0);

      var buttons = election.pollData.map(function(item) {
        //var votes = item.voters.length > 0 ? ` — ${item.voters.length}` : '';
        //return [{ text: item.name + votes, callback_data: 'vote_' + item.uid }];
        return [{ text: item.name, callback_data: 'vote_' + item.uid }];
      });

      bot.editMessageText(pollText.replace('$sum', tools.declension(sum, 'men')), {
        chat_id: msg.message.chat.id,
        message_id: election.pollMsgId,
        reply_markup: { inline_keyboard: buttons },
        parse_mode: 'markdown'
      }).catch(err => {});
      bot.answerCallbackQuery(msg.id, { text: 'Голос учтён' });

      var candidate = await bot.getChatMember(msg.message.chat.id, vote);
      console.log('[Выборы]', tools.name2show(msg.from) + ' (' + msg.from.id + ') проголосовал за ' + tools.name2show(candidate.user) + ' (' + vote + ')');
    }
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
    var pollMessage = await bot.sendMessage(config.groupId, pollText.replace('$sum', 0), { parse_mode: 'markdown', reply_markup: { inline_keyboard: buttons } });
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
      message_id: election.pollMsgId
    }).catch(err => { console.log(err.message) });

    if (votesSorted[0].votes != votesSorted[1].votes) {

      bot.sendMessage(config.groupId, winnerText.replace('$name', '[' + votesSorted[0].name + '](tg://user?id=' + votesSorted[0].uid + ')') + refText, {
        reply_to_message_id: election.pollMsgId,
        parse_mode: 'markdown',
        disable_web_page_preview: 'true'
      });

      await Users.updateOne({ uid: votesSorted[0].uid }, { $set: { isMod: true } });

    } else {
      var winners = votesSorted.filter(function(item) {
        return votesSorted[0].votes == item.votes;
      });

      var names = winners.map(function(item) {
        return `[${item.name}](tg://user?id=${item.uid})`;
      });

      bot.sendMessage(config.groupId, winnersText.replace('$names', names.join(', ')) + refText, {
        reply_to_message_id: election.pollMsgId,
        parse_mode: 'markdown',
        disable_web_page_preview: 'true'
      });

      var uids = winners.map(item => item.uid);
      await Users.updateMany({ uid: { $in: uids } }, { $set: { isMod: true } });
      console.log('[Выборы] Получилось несколько победителей, назначаются все');
    }

    await Elections.updateOne({ $or: [{ stage: 'voting' }] }, { $set: { stage: 'archive', stageAt: Date.now() } });
  };

  /* Цикл, в котором переключаются этапы программы выборов */
  async function сycle() {
    var election = await Elections.findOne({ $or: [{ stage: 'collecting' }, { stage: 'voting' }] });

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
    }
  };

  сycle();
  setInterval(сycle, 5 * 60 * 1000);

};