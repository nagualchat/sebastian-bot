const moment = require('moment');
const Users = require('../models/users');
const Elections = require('../models/elections');
const tools = require('../tools');
const config = require('../config');

const pollText = 'Пришло время выборов! Голосуйте за того, кто будет модератором в течении следующей недели.\n\n' +
  '_Голосование анонимное. Участники выбраны случайным образом из числа активных. Опрос продлится 24 часа, после чего будут объявлены результаты._';
const pollEndText = 'Результаты голосования\n\n$top'
const finalText = 'Выборы завершились победой $name. Поздравляю!\n\n' +
  'Модераторские полномочия будут активны в течении недели. Ознакомиться с доступными в это время командами можно набрав /mod. Пользуйся ими с умом.'
const final2Text = 'Слишком мало голосов для того чтобы можно было однозначно выявить победителя. Следующая неделя пройдёт без модератора.'

// Длительность этапов выборов в часах
const collectingTime = 168;
const votingTime = 24;

const minCandidates = 3;
const minVotesWinner = 2;

module.exports = function(bot) {

  /* Каждый писака добавляется в список кандидатов */
  bot.on('message', async (msg) => {
    if (msg.chat.type == 'supergroup') {
      // FIXME - тяжёловатая операция
      var election = await Elections.findOne({ stage: 'collecting' });
      if (election && election.candidates.indexOf(msg.from.id) === -1) {
        console.log('[Выборы] Добавлен кандидат ' + tools.name2show(msg.from) + ' (' + msg.from.id + ')');
        await Elections.update({ stage: 'collecting' }, { $push: { candidates: msg.from.id } });
      }
    }
  });

  /* Обработка нажатий на кнопки опроса */
  bot.on('callback_query', async (msg) => {
    var matches = msg.data.match(/vote\_(\d+)/);
    if (matches) var vote = parseInt(matches[1]);
    var election = await Elections.findOne({ stage: 'voting' });

    // Игнорировать голос, если он ранее был отдан этому же кандидату
    if (election.pollData.find(x => x.uid === vote).voters.indexOf(msg.from.id) != -1) {
      bot.answerCallbackQuery(msg.id);
      return;
    };

    for (item of election.pollData) {
      var index = item.voters.indexOf(msg.from.id);
      if (index > -1) {
        item.voters.splice(index, 1);
      }
      if (item.uid === vote) {
        item.voters.push(msg.from.id);
      }
    };

    election.save(function(err) {
      if (err) console.log(err);
    });

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
    bot.answerCallbackQuery(msg.id, 'Голос учтён');
    console.log('[Выборы]', tools.name2show(msg.from) + ' (' + msg.from.id + ') проголосовал за ' + vote);
  });

  /* Цикл, в котором переключаются этапы программы выборов */
  setInterval(async function сycle() {
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
  }, 60000);


  /* Проверка кандидатов и создание опроса, если всё окей */
  async function startVoting(election) {
    var candidatesTmp = [];

    // Фильтрация кандидатов от ботов, админов и покинувших группу участников
    await Promise.all(election.candidates.map(async (id) => {
      var candidate = await bot.getChatMember(config.groupId, id);
      //if (!candidate.user.is_bot && candidate.status === 'member') {
      if (!candidate.user.is_bot && candidate.status === 'member' || candidate.status === 'creator') {
        candidatesTmp.push({ uid: candidate.user.id, name: tools.name2show(candidate.user), voters: [] });
      }
    }));

    if (candidatesTmp.length + 1 < minCandidates) {
      await Elections.update({ stage: 'collecting' }, { stage: 'archive', stageAt: Date.now() });
      console.log('[Выборы] Слишком мало кандидатов, голосование отменяется');
      return;
    }

    // Выбор десяти случайных участников
    tools.shuffle(candidatesTmp);
    candidatesTmp.slice(0, 10);

    var buttons = candidatesTmp.map(function(item) {
      return [{ text: item.name, callback_data: 'vote_' + item.uid }];
    });
    var pollMessage = await bot.sendMessage(config.groupId, pollText, { parse_mode: 'markdown', reply_markup: { inline_keyboard: buttons } });
    bot.pinChatMessage(config.groupId, pollMessage.message_id);

    await Users.update({}, { $unset: { isMod: 1 } }, { multi: true });
    await Elections.update({ stage: 'collecting' }, { stage: 'voting', stageAt: Date.now(), pollData: candidatesTmp, pollMsgId: pollMessage.message_id });
  };


  /* Вычисление результатов голосования и назначение выбранного модератора */
  async function endVoting(election) {
    var votesSorted = election.pollData.map(function(item) {
      return { uid: item.uid, name: item.name, votes: item.voters.length };
    });

    // Сортировка сначала по количеству голосов, потом дополнительно по имени
    votesSorted.sort(function(vote1, vote2) {
      if (vote1.votes > vote2.votes) return -1;
      if (vote1.votes < vote2.votes) return 1;
      if (vote1.name > vote2.name) return 1;
      if (vote1.name < vote2.name) return -1;
    });

    var top = votesSorted.map(function(item) {
      return `${item.name}  —  ${item.votes}`;
    });
    bot.unpinChatMessage(config.groupId);
    bot.editMessageText(pollEndText.replace('$top', top.join('\n')), { chat_id: config.groupId, message_id: election.pollMsgId, parse_mode: 'markdown' });

    if (votesSorted[0].votes >= minVotesWinner && votesSorted[0].votes != votesSorted[1].votes) {
      await Users.update({ uid: votesSorted[0].uid }, { isMod: true });
      bot.sendMessage(config.groupId, finalText.replace('$name', '[' + votesSorted[0].name + '](tg://user?id=' + votesSorted[0].uid + ')'), { reply_to_message_id: election.pollMsgId, parse_mode: 'markdown' });
    } else {
      bot.sendMessage(config.groupId, final2Text, { reply_to_message_id: election.pollMsgId });
    }
    await Elections.update({ stage: 'voting' }, { stage: 'archive', stageAt: Date.now() });
  };

};