const os = require('os');

class PlexServer {
	constructor(config) {
		if (!config.product) {
			config.product = 'Plex iTunes Import';
		}
		if (!config.deviceName) {
			let hostname = os.hostname();
			if (hostname) {
				hostname = hostname.replace(/\..*$/, '');
			}
			config.deviceName = hostname;
		}
		if (!config.version) {
			config.version = '0.2.0';
		}

		this.config = config;
	}

	getClientOptions() {
		let clientOptions = {
			options: {}
		};
		Object.assign(clientOptions.options, this.config);

		for (let configKey of ['hostname', 'port', 'username', 'password', 'managedUser']) {
			if (this.config[configKey]) {
				clientOptions[configKey] = this.config[configKey];
			}
			delete clientOptions.options[configKey];
		}
		return clientOptions;
	}

	toString() {
		return 'PlexServer[' + this.config.hostname + ']';
	}
}

module.exports = PlexServer;