const start      = new RegExp('^[\\t\\s]*');
const end        = new RegExp('[\\t\\s]*$');
const diacritics = require('diacritics').remove;

class util {
	static strictEncodeURIComponent(str) {
		return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
			return '%' + c.charCodeAt(0).toString(16);
		});
	}

	static stringify(obj) {
		return JSON.stringify(obj,null,2);
	}

	static stripName(name) {
		return diacritics(name.toLowerCase().replace(start, '').replace(end, '').normalize('NFD'));
		/*
		const replaced = XRegExp.replace(name, alphaNumeric, '').toLowerCase();
		console.log('stripName: ' + name + ' -> ' + replaced);
		return replaced;
		*/
	}
}

module.exports = util;