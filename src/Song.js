const debug = false;

function format(str) {
	"use strict";
	if (str) {
		return str.toLowerCase();
	} else {
		return 'unkwnown';
	}
}

function doLog(text) {
	"use strict";
	if (debug) {
		console.log(text);
	}
}

class Song {
	constructor(i, n, a, ar, d, t, p, f) {
		this.id     = i;
		this.name   = n?  n.normalize()   : n;
		this.album  = a?  a.normalize()   : a;
		this.artist = ar? ar.normalize()  : ar;
		this.disc   = d?  parseInt(d, 10) : -1;
		this.track  = t?  parseInt(t, 10) : -1;
		this.path   = p?  p.normalize()   : p;
		this.file   = f?  f.normalize()   : f;
	}

	log(text) {
		if (this._logger) {
			this._logger.debug(text);
		} else {
			doLog(text);
		}
	}

	setLogger(logger) {
		this._logger = logger;
	}

	index() {
		return format(this.artist) + '###' + format(this.album) + '###' + format(this.name);
	}

	matches(other, prefixes, allowFuzzy=true) {
		const self = this;

		if (prefixes && other.file && self.file) {
			self.log('self.file=' + self.file + ', other.file=' + other.file);
			let selfFiles = prefixes.map(function(prefix) {
				return self.file.replace(new RegExp('^' + prefix), '').toLowerCase();
			});
			let otherFiles = prefixes.map(function(prefix) {
				return other.file.replace(new RegExp('^' + prefix), '').toLowerCase();
			});

			self.log('prefixes=' + JSON.stringify(prefixes));
			self.log('selfFiles=' + JSON.stringify(selfFiles));
			self.log('otherFiles=' + JSON.stringify(otherFiles));
			for (const selfFile of selfFiles) {
				for (const otherFile of otherFiles) {
					if (otherFile.endsWith(selfFile)) {
						self.log(otherFile + ' ends with ' + selfFile);
						return true;
					} else if (selfFile.endsWith(otherFile)) {
						self.log(selfFile + ' ends with ' + otherFile);
						return true;
					}
				}
			}
		}

		if (allowFuzzy) {
			self.log('No matches, falling back to index.');
			let ret = self.index() === other.index();
			if (ret === true && self.disc > -1 && other.disc > -1) {
				ret = self.disc === other.disc;
			}
			if (ret === true && self.track > -1 && other.track > -1) {
				ret = self.track === other.track;
			}
			return ret;
		}

		return false;
	}

	toString() {
		return 'Song: ' + this.artist + ' - ' + this.album + ' - ' + this.name;
	}

	toJSON() {
		return {
			id: this.id,
			name: this.name,
			album: this.album,
			artist: this.artist,
			disc: this.disc,
			track: this.track,
			path: this.path,
			file: this.file
		};
	}
}

module.exports = Song;