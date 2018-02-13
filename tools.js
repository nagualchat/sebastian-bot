const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');
const http = require('https');
const ogg = require('ogg');
const lame = require('lame');
const opus = require('node-opus');
const fs = require('fs');

const messages = require('./config/messages');

// Функция для вывода второй части имени, если она есть
function nameToBeShow(msg) {
  if (msg.last_name != undefined) {
    return msg.first_name + ' ' + msg.last_name;
  } else {
    // Убирает собаку из имени, чтобы не получалась ссылка
    return msg.first_name.replace(/^@(.?)/g, '$1');
  }
};

// Выбор случайной строки из массива
function getRandom(array) {
  var randomMessage = Math.floor(Math.random() * array.length);
  return array[randomMessage];
};

function advancedRandom(array) {
  // Строки копируются в другой массив, умножаясь в соответствии со значением weight
  var arrayIds = [];
  for(var i=0;i<array.length;i++){
      for(var x=0;x<array[i].weight;x++){
          arrayIds.push(array[i].text);
      }
  }
  // Из размноженных элементов выбирается случайный
  var index = Math.floor(Math.random() * (arrayIds.length));
  // В котором случайно выбираются подстроки, оформленные в {}
  var str = arrayIds[index].replace(/{([^}]+)}/g, function(p, m){
    var arr = m.split("|");
    return arr[~~(Math.random() * arr.length)];
  });
  return str;
};

// Выбор случайной строки из текстового файла
function getRandomLine(filename){
  var lines = fs.readFileSync(filename, 'utf8').toString().split("\n");
  var randomLine = Math.floor(Math.random() * lines.length);
  return lines[1];
}

// Cортировка значений массива
function compareNumeric(a, b) {
  if (a > b) return 1;
  if (a < b) return -1;
}

// Функция делает первую букву строки заглавной
function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Делает первую букву заглавной и расставляет точки
function correction(string) {
  var capitalized =  string.charAt(0).toUpperCase() + string.slice(1);
  return capitalized.replace(/([а-я]) ([А-Я])/g, '$1. $2') + '.';
}

// Общая функция склонение слов для согласования с числами
function decl(number, titles) {
  cases = [2, 0, 1, 1, 1, 2];
  return number + ' ' + titles[ (number%100>4 && number%100<20)? 2 : cases[(number%10<5)?number%10:5] ];
}

// Склонение слов
function declension(match, mode) {
  var words = {message: ['сообщение', 'сообщения', 'сообщений'], plus: ['плюс', 'плюса', 'плюсов']};
  return decl(match, words[mode]);
}

// Функция отображения срока наказания для мьюта, бана и кика
function dconvert(match, mode) {
  var regexp = match.match(/(\d*)(\S)/i);
  // Склонения можно определить, примеряя к цифрам 1, 3 и 5
  var words = {day: ['день', 'дня', 'дней'], hour: ['час', 'часа', 'часов']};
  if (regexp[2] == 'd') {
    if (mode == 'date') {
      return date = moment().add(regexp[1], 'days').unix();
    } else {
      return decl(regexp[1], words[day]);
    }
  } else if (regexp[2] == 'h') {
      if (mode == 'date') {
        return date = moment().add(regexp[1], 'hours').unix();
    } else {
      return decl(regexp[1], words[hour]);
    }
  } else return 'err';
};

// Переводит код причины удаления, бана и кика в человекочитаемый вид
function menuReason(match) {
  for (var key in messages.restrictReasons) {
    if (match[1] == key) return messages.restrictReasons[key];
  }
}

// Подрезание параграфа для отображения в списке результатов поиска
function truncate(sentence, search, length) {
  var index = sentence.toLowerCase().indexOf(search);
  // Если перед искомым словом не найдено точки, то начальной позицией считается начало строки
  var leftIndex = sentence.lastIndexOf('. ', index) == -1 ? 0 : sentence.lastIndexOf('. ', index) + 2;
  var str = sentence.substring(leftIndex, index + search.length + length);
  // Короткая строка выводится целиком
  if(str.length <= length) return(str);
  // Если срез пришёлся на середину слова, то строка укорачивается до первого найденного пробела
  str = str.substr(0, Math.min(str.length, str.lastIndexOf(' ')))
  return str;
}

// Вывод количества найденного и поискового запроса
function showSearchPhrases(result, query) {
  var amount = result.length >= 50 ? 'Найдено >50' : 'Найдено: ' + result.length;
  // Если есть terms, но нету phrases
  if (query.terms.join().length && !query.phrases.join().length) {
    queries = query.terms.join(', ');
  // Если есть phrases, но нету terms
  } else if (query.phrases.join().length && !query.terms.join().length) {
    queries = '"' + query.phrases.join(', ') + '"';
  } else {
    // А если есть phrases и terms, нужно вычистить дубликаты
    var terms = query.terms.filter(function(term) {
    var phrase;
      for (var i in query.phrases) {
        if (query.phrases[i].toString().match(new RegExp('^' + term, 'g')))
          phrase = term;
      }
    // Фильтр отбрасывает те terms, которые похожи на phrases
    return term != phrase;
  });
    queries = terms.join().length < 1 ? '"' + query.phrases.join(', ') + '"' : '"' + query.phrases.join(', ') + '", ' + terms.join(', ');
  }
  return amount + ' (' + queries + ')';
};

// Отправляет файл на сервер wit.ai для распознавания речи
function speechToText(file, token) {
  return new Promise((resolve) => {
    const options = {
      'method': 'POST',
      'hostname': 'api.wit.ai',
      'port': null,
      'path': '/speech?v=20170307',
      'headers': {
        'authorization': 'Bearer ' + token,
        'content-type': 'audio/mpeg3',
        'cache-control': 'no-cache'
      }
    };
    const req = http.request(options, function (res) {
      const chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk);
      })
      res.on('end', function () {
        const body = Buffer.concat(chunks);
        resolve(JSON.parse(body.toString()));
      })
    })
    fs.createReadStream(file).pipe(req);
  })
};

// Конвертирует opus/ogg в mp3
function voiceConvert(file) {
  return new Promise((resolve) => {
    var oggDecoder = new ogg.Decoder();
    oggDecoder.on('stream', function (stream) {
      var opusDecoder = new opus.Decoder();
      opusDecoder.on('format', function (format) {
        var mp3Encoder = new lame.Encoder({
          // Входные параметры
          channels: format.channels,
          bitDepth: format.bitDepth,
          sampleRate: format.sampleRate,
        });
        var out = fs.createWriteStream(file + '.mp3');
        opusDecoder.pipe(mp3Encoder).pipe(out)
        .on('close', function () {
          resolve();
        });
      });
      stream.pipe(opusDecoder);
      stream.on('error', err => {
        console.error('[Voice] Ошибка конвертации (ogg):', err.message);
      });
      opusDecoder.on('error', function (err) {
        console.log('[Voice] Ошибка конвертации (opus):', err.message);
      });
    });
    fs.createReadStream(file).pipe(oggDecoder);
  })
};

exports.nameToBeShow = nameToBeShow;
exports.getRandom = getRandom;
exports.advancedRandom = advancedRandom;
exports.getRandomLine = getRandomLine;
exports.compareNumeric = compareNumeric;
exports.capitalize = capitalize;
exports.decl = decl;
exports.declension = declension;
exports.dconvert = dconvert;
exports.menuReason = menuReason;
exports.truncate = truncate;
exports.showSearchPhrases = showSearchPhrases;
exports.correction = correction;
exports.speechToText = speechToText;
exports.voiceConvert = voiceConvert;