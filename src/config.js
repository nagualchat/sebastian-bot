const env = process.env.NODE_ENV; // Может быть production или development

const connections = {
  'production': {
    telegramToken: '',
    mongo: {
      url: '',
      options: {}
    },
    groupId: 
  },

  'development': {
    telegramToken: '',
    mongo: {
      url: '',
      options: {}
    },
    groupId: 
  }
};

const settings = {
  channelId: ,  // ID канала для удалённых сообщений
  adminUid: ,        // UID админа
  siteUrl: 'http://nagualism.space',
};

module.exports = Object.assign(connections[env], settings);
