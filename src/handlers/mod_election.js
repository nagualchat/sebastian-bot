const moment = require('moment');
const Elections = require('../models/elections');
const Users = require('../models/users');
const tools = require('../tools');
const config = require('../config');

const pollText = 'Пришло время выборов! Голосуйте за того, кто будет модератором в течении следующей недели.\n\n' +
  '_Голосование анонимное. Участники выбраны случайным образом из числа активных. Опрос продлится 24 часа, после чего будут объявлены результаты._';
const pollEndText = 'Результаты голосования\n\n$top'
const finalText = 'Выборы завершились победой $name. Поздравляю!\n\n' +
  'Модераторские полномочия будут активны в течении недели. Ознакомиться с доступными в это время командами можно набрав /mod. Пользуйся ими с умом, придерживаясь правил чата.'
const final2Text = 'Слишком мало голосов для того чтобы можно было однозначно выявить победителя. Следующая неделя пройдёт без модератора.'

// Длительность этапов выборов в часах
const collectingTime = 168;
const votingTime = 24;

const minCandidates = 2;
const minVotesWinner = 2;

module.exports = function(bot) {

  /* Каждый писака добавляется в список кандидатов */
  bot.on('message', async (msg) => {
    if (msg.chat.type == 'supergroup') {
      // $addToSet добавляет в массив только в том случае, если такого элемента ещё не содержит
      var election = await Elections.updateOne({ stage: 'collecting' }, { $addToSet: { candidates: msg.from.id } });
      if (election && election.nModified) console.log('[Выборы] Добавлен кандидат ' + tools.name2show(msg.from) + ' (' + msg.from.id + ')');
    }
  });

  /* Обработка нажатий на кнопки опроса */
  bot.on('callback_query', async (msg) => {
    var member = await bot.getChatMember(msg.message.chat.id, msg.from.id)
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

    var buttons = election.pollData.map(function(item) {
      var votes = item.voters.length > 0 ? ` — ${item.voters.length}` : '';
      return [{ text: item.name + votes, callback_data: 'vote_' + item.uid }];
    });
    bot.editMessageText(pollText, {
      chat_id: msg.message.chat.id,
      message_id: election.pollMsgId,
      reply_markup: { inline_keyboard: buttons },
      parse_mode: 'markdown'
    });
    bot.answerCallbackQuery(msg.id, { text: 'Голос учтён' });

    console.log('[Выборы]', tools.name2show(msg.from) + ' (' + msg.from.id + ') проголосовал за ' + vote);
  });

  /* Проверка кандидатов и создание опроса, если всё окей */
  async function startVoting(election) {
    var candidatesTmp = [];

    // Фильтрация кандидатов от ботов, админов и покинувших группу участников
    await Promise.all(election.candidates.map(async (id) => {
      var candidate = await bot.getChatMember(config.groupId, id);
      if (!candidate.user.is_bot && candidate.status === 'member') {
      //if (!candidate.user.is_bot && candidate.status === 'member' || candidate.status === 'creator') {
        candidatesTmp.push({ uid: candidate.user.id, name: tools.name2show(candidate.user), voters: [] });
      }
    }));

    if (candidatesTmp.length + 1 < minCandidates) {
      await Elections.updateOne({ stage: 'collecting' }, { stage: 'archive', stageAt: Date.now() });
      console.log('[Выборы] Слишком мало кандидатов, голосование отменяется');
      return;
    }

    // Выбор десяти случайных участников
    tools.shuffle(candidatesTmp);
    candidatesTmp.slice(0, 10);
    candidatesTmp = tools.sortByAttribute(candidatesTmp, 'name')

    var buttons = candidatesTmp.map(function(item) {
      return [{ text: item.name, callback_data: 'vote_' + item.uid }];
    });
    var pollMessage = await bot.sendMessage(config.groupId, pollText, { parse_mode: 'markdown', reply_markup: { inline_keyboard: buttons } });
    bot.pinChatMessage(config.groupId, pollMessage.message_id);

    await Users.updateMany({}, { $unset: { isMod: 1 } });
    await Elections.updateOne({ stage: 'collecting' }, { stage: 'voting', stageAt: Date.now(), pollData: candidatesTmp, pollMsgId: pollMessage.message_id });
  };

  /* Вычисление результатов голосования и назначение выбранного модератора */
  async function endVoting(election) {
    var votesSorted = election.pollData.map(function(item) {
      return { uid: item.uid, name: item.name, votes: item.voters.length };
    });

    // Сортировка сначала по количеству голосов, потом дополнительно по имени
    votesSorted = tools.sortByAttribute(votesSorted, '-votes', 'name')

    var top = votesSorted.map(function(item) {
      return `${item.name}  —  ${item.votes}`;
    });

    try {
      await bot.unpinChatMessage(config.groupId);
      await bot.editMessageText(pollEndText.replace('$top', top.join('\n')), { chat_id: config.groupId, message_id: election.pollMsgId, parse_mode: 'markdown' });
    } catch (err) {}

    if (votesSorted[0].votes >= minVotesWinner && votesSorted[0].votes != votesSorted[1].votes) {
      await Users.updateOne({ uid: votesSorted[0].uid }, { isMod: true });
      bot.sendMessage(config.groupId, finalText.replace('$name', '[' + votesSorted[0].name + '](tg://user?id=' + votesSorted[0].uid + ')'), { reply_to_message_id: election.pollMsgId, parse_mode: 'markdown' });
    } else {
      bot.sendMessage(config.groupId, final2Text, { reply_to_message_id: election.pollMsgId });
    }

    await Elections.updateOne({ stage: 'voting' }, { stage: 'archive', stageAt: Date.now() });
  };

  /* Цикл, в котором переключаются этапы программы выборов */
  async function сycle() {
    var election = await Elections.findOne({ $or: [{ stage: 'collecting' }, { stage: 'voting' }] });

    if (!election) {
      console.log('[Выборы] Не найдено активной сессии, создаю новую');
      await Elections.create({ stage: 'collecting', stageAt: Date.now() });
      return;
    };

    if (election.stage === 'collecting' && moment().diff(moment(election.stageAt), 'hours') >= collectingTime) {
      startVoting(election);
      console.log('[Выборы] Этап выявления кандидатов завершён, начинаю голосование');
    } else if (election.stage === 'voting' && moment().diff(moment(election.stageAt), 'hours') >= votingTime) {
      endVoting(election);
      console.log('[Выборы] Голосование завершено');
    };
  };

  сycle();
  setInterval(сycle, 120000);
};