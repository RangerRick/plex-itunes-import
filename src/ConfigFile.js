const fs = require('fs');
const uuid = require('node-uuid');
const yaml = require('js-yaml');

const spaces = new RegExp('[\\t\\s]+', 'g');

function getRegExp(obj) {
	"use strict";

	let ret = [];

	if (!obj) {
		return ret;
	}

	if (obj instanceof String || typeof(obj) === 'string') {
		ret.push(new RegExp(obj, 'g'));
	} else {
		for (const re of obj) {
			ret.push(new RegExp(re, 'g'));
		}
	}

	return ret;
}

function ConfigFile(filename) {
	"use strict";
	this.filename = filename;
	this.exists = fs.existsSync(filename);
	let config = yaml.safeLoad(fs.readFileSync(filename, 'utf8'));
	Object.assign(this, config);

	this._stripNames = getRegExp(this.stripNames);

	this.stripNames = function(str) {
		if (!str) {
			return str;
		}

		let ret = str;
		for (const re of this._stripNames) {
			ret = ret.replace(re, ' ');
		}

		return ret.replace(spaces, ' ');
	};

	this.save = function() {
		let saveme = JSON.parse(JSON.stringify(this));

		for (var prop of ['name', 'alias', 'filename', 'exists', 'save', '_stripNames']) {
			delete saveme[prop];
		}

		if (this._stripNames.length > 0) {
			let res = [];
			for (const re of this._stripNames) {
				res.push(re.source);
			}
			saveme.stripNames = res;
		}

		fs.writeFileSync(this.filename, yaml.safeDump(saveme));
	};

	if (!this.identifier) {
		this.identifier = uuid.v4();
		this.save();
	}

	return this;
}

module.exports = ConfigFile;