const TelegramBot = require('node-telegram-bot-api'); 
const moment = require('moment');

// Функция для вывода второй части имени, если она есть
function nameToBeShow(msg) {
  if (msg.last_name != undefined) {
    return msg.first_name + ' ' + msg.last_name;
  } else {
    return msg.first_name;
  }
};

// Функция для выбора случайной строки из массива
function random(message) {
  var randomIndex = Math.floor(Math.random() * message.length);
  return message[randomIndex];
};

// Функция делает первую букву строки заглавной
function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Функция склонения слов для согласования с числами
function declension(number, titles) {  
    cases = [2, 0, 1, 1, 1, 2];  
    return number + ' ' + titles[ (number%100>4 && number%100<20)? 2 : cases[(number%10<5)?number%10:5] ];  
}

function msgDecl(match) {
  var msgname = ['сообщение', 'сообщения', 'сообщений'];
  return declension(match, msgname);
}


// Функция отображения срока наказания для команд /mute, mute2 и /ban
function duration(match, mode) {
  var regexp = match.match(/(\d*)(\S)/i);
  // Склонения можно определить, примеряя к цифрам 1, 3 и 5
  var dayname = ['день', 'дня', 'дней'];
  var hourname = ['час', 'часа', 'часов'];

  if (regexp[2] == 'd') { 
    if (mode == 'date') {
      return date = moment().add(regexp[1], 'days').unix();
    } else {
      return declension(regexp[1], dayname);
    }        
  } else if (regexp[2] == 'h') {
      if (mode == 'date') {
        return date = moment().add(regexp[1], 'hours').unix();
    } else {
      return declension(regexp[1], hourname);
    }
  } else return 'err';
}; 

exports.nameToBeShow = nameToBeShow;
exports.random = random;
exports.capitalize = capitalize;
exports.declension = declension;
exports.msgDecl = msgDecl;
exports.duration = duration;