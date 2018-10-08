/*  Инлайн-поиск по книгам Кастанеды  */

const axios = require('axios');
const config = require('../config');

const instance = axios.create({ baseURL: config.siteUrl });
async function search(query, offset) {
  return await instance.get('/api/bot-search', { params: { query, offset } })
    .catch(error => {
      console.log(error.message);
    });
};

module.exports = async function(bot) {

  bot.on('inline_query', async (msg) => {
    if (msg.query) {
      var offset = parseInt(msg.offset) || 0;
      var res = await search(msg.query, offset);
      var results = res.data.hits.hits.map(a => {
        return {
          id: a._id || msg.id,
          type: 'article',
          title: `${a._source.book.author} — ${a._source.book.title}`,
          input_message_content: {
            parse_mode: 'markdown',
            message_text: `${a._source.content.text}\n[${a._source.book.author} — ${a._source.book.title}](${config.siteUrl}/reader?book=${a._source.book.id}&ch=${a._source.chapter.id}&p=${a._source.content.number})`,
            disable_web_page_preview: true
          },
          description: a.highlight['content.text'][0]
        }
      })
      bot.answerInlineQuery(msg.id, results, { next_offset: offset + 10, cache_time: 3000, switch_pm_text: 'Результатов: ' + res.data.hits.total, switch_pm_parameter: 'search' });
    } else {
      bot.answerInlineQuery(msg.id, [], { cache_time: 0, switch_pm_text: 'Справка', switch_pm_parameter: 'help' });
    }
  });

};