const env = process.env.NODE_ENV;

const connections = {
  'production': {
    telegramToken: '466800324:AAH07nH1euCI2HarlRUDG5d0Uo1E3I_NEBg',
    mongo: {
      url: 'mongodb://bot:AXJa9fSj7Ng35sBs@ds038547.mlab.com:38547/sebastian-db',
      options: { useNewUrlParser: true }
    },
    groupId: -1001083395167
  },

  'development': {
    telegramToken: '444454596:AAEmW1sb2szx1KCDDsA8glDpy8KK2zJtCeU', // @botbotobot
    mongo: {
      url: 'mongodb://bot:VK4vgvuZa5fZRa47@ds133004.mlab.com:33004/sebastian-db', // eirim
      options: { useNewUrlParser: true }

    },
    groupId: -1001137207327
  }
};

const settings = {
  channelId: -1001135900667, // ID канала для удалённых сообщений
  adminUid: 200352801, // UID админа
  siteUrl: 'http://nagualism.space',
};

module.exports = Object.assign(connections[env], settings);