module.exports = function(bot) {
	require('fs').readdirSync(__dirname).forEach(function(file) {
		if (file !== 'index.js') {
			require('./' + file)(bot);
		}
	});
};