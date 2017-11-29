const TelegramBot = require('node-telegram-bot-api'); 
const moment = require('moment');
const fs = require('fs');
const messages = require('./config/messages');

// Функция для вывода второй части имени, если она есть
function nameToBeShow(msg) {
  if (msg.last_name != undefined) {
    return msg.first_name + ' ' + msg.last_name;
  } else {
    return msg.first_name;
  }
};

// Выбор случайной строки из массива
function getRandom(message) {
  var randomMessage = Math.floor(Math.random() * message.length);
  return message[randomMessage];
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

exports.nameToBeShow = nameToBeShow;
exports.getRandom = getRandom;
exports.getRandomLine = getRandomLine;
exports.compareNumeric = compareNumeric;
exports.capitalize = capitalize;
exports.decl = decl;
exports.declension = declension;
exports.dconvert = dconvert;
exports.menuReason = menuReason;