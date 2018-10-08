const env = process.env.NODE_ENV; // Может быть production или development

const connections = {
  'production': {
    telegramToken: '466800324:AAEJiwvBnm6CaJ9Y93N6j4EbdLWIde37Wvo',
    mongo: {
      url: 'mongodb://bot:B4a7ZJaDcYAeTt@ds038547.mlab.com:38547/sebastian-db',
      options: {}
    },
    groupId: -1001083395167
  },

  'development': {
    telegramToken: '444454596:AAHtdxKjjQaF-9wGmYdScgGjvS8GoFa6M4M', // @botbotobot
    mongo: {
      url: 'mongodb://bot:B4a7ZJaDcYAeTt@ds133004.mlab.com:33004/sebastian-db', // eirim
      options: {}
    },
    groupId: -1001137207327
  }
};

const settings = {
  channelId: -1001135900667,  // ID канала для удалённых сообщений
  adminUid: 200352801,        // UID админа
  siteUrl: 'http://nagualism.space',
};

module.exports = Object.assign(connections[env], settings);