var VERSION = chrome.app.getDetails().version;
var dropboxClient, scopeSandbox;

function checkFirstInstall() {
	chrome.storage.local.get("installedVersion", function(item){
		if ( (typeof item.installedVersion === "undefined") || (VERSION > item.installedVersion) ) {
			chrome.tabs.create({url: "/about/about.html"});
			chrome.storage.local.set({"installedVersion": VERSION});
		}
	});
}

function isPopup() {
	return chrome.extension.getViews({type: "popup"}).length;
}

function messageParser (request, sender, sendResponse) {
	if (request.message == "initDropbox") {
		chrome.storage.local.get("scopeSandbox", function(item){
			initDropbox(item.scopeSandbox);
		});
	}
}

function initDropbox(scopeSandbox) {
	var appKey;
	if (scopeSandbox == "fullaccess") {
		appKey = { key: "Rh+OOZopQWA=|/l2LorDndi6WTlJ9pvMTWDGhJXJVIM0RREIFzMzM1g==", sandbox: false };
	}
	else {
		appKey = { key: "xfiZVeKWR3A=|lzFZIO70hXvPKMHfHDm9fdgrL27H0sEvRW9SZJ/14g==", sandbox: true };
	}
	var client = new Dropbox.Client(appKey);
	// Modifying Redirect Driver prototype...
	// ... because window.assign cannot be used in a Chrome extension popup
	Dropbox.Drivers.Redirect.prototype.doAuthorize = function(url){ chrome.tabs.create({url: url}); };
	// ... to allow receiverUrl
	Dropbox.Drivers.Redirect.prototype.oldComputeUrl = Dropbox.Drivers.Redirect.prototype.computeUrl;
	Dropbox.Drivers.Redirect.prototype.computeUrl = function(options) {
		if (options.receiverUrl) { 
			return options.receiverUrl + "#?_dropboxjs_scope=" + this.scope;
		}
		else {
			return this.oldComputeUrl();	
		}
	}
	client.authDriver(new Dropbox.Drivers.Redirect({
		receiverUrl: "chrome-extension://" + chrome.app.getDetails().id + "/popup/popup.html",
		rememberUser: true,
		scope: scopeSandbox
	}));
	client.authenticate(function(error, data) {
   		if (error) {
   			return chrome.extension.sendMessage({message: "initDropboxError", error: error});
   		}
	 	// Authentication successful
	 	dropboxClient = client;
	 	chrome.extension.sendMessage({message: "initSingleFile"});
	});
}


// MAIN
checkFirstInstall();
chrome.extension.onMessage.addListener(messageParser);
