var dropboxClient;
var readdirCalls, readdirCompleted;

// Utils

function isPopup() {
	return chrome.extension.getViews({type: "popup"}).length;
}

function closePopup() {
	chrome.tabs.getSelected(null, function(tab) {
		chrome.tabs.update(tab.id, { selected: true } )
	}); 
}

function closeCurrentTab() {
	chrome.tabs.getSelected(null, function(tab) {
		chrome.tabs.remove(tab.id);
	}); 
}

function filterName(name) {
	return name ? name.replace(/[\\/:\?\*<>\"\|]/g, "") : "";
}

function showError(error, abortAll) {
	return $("#dialog").attr("title", "Error")
	.text("Error encounterd: " + error)
	.dialog({buttons: {	
		"Ok": function(){ 
			if (!abortAll) {
				$(this).dialog("close");
			}
			else {
				closePopup();
			}
		}
	}, modal: true, resizable: false });
}

function addNode (dest, folder, open) {
	if (open) {
		$("#tree").bind("create_node.jstree", function() {
			$("#tree").unbind("create_node.jstree")
			.jstree("open_node", dest);
		});
	}
	$("#tree").jstree("create_node", dest, "inside", folder);
}

// UI functions

function init(arg) {
	if (!arg) {
		chrome.storage.local.get("scopeSandbox", function(item){
			initDropbox(item.scopeSandbox);
		});
	}
	else if (arg == "SingleFile") {
		initSingleFile();
	}
	else if (arg == "Scrap2Drop") {
		chrome.storage.local.get(["scopeSandbox", "lastsel"], function(item){
			if (item.scopeSandbox == "sandbox") {
				$("#Scrap2DropRoot > a").text("Scrap2Drop");
			}
			else {
				$("#Scrap2DropRoot > a").text("Dropbox");
			}
			$("#tree").jstree({
				"themes": {"theme": "classic"},
				"plugins": ["html_data", "themes"]
			});
			if ( (typeof item.lastsel === "undefined") ) {
				item.lastsel = "/";
			}
			loadTreeDownTo(item.lastsel);
		});
		$("#logoff").click(logoff);
		$("#openDropbox").click(openDropbox);
		$("#addFolder").click(addFolder);
		$("#savePage").click(savePage);
		chrome.tabs.getSelected(null, function(tab) {
			$("#pagename").val( filterName(tab.title) )
			.keydown(function(e) {
				if (e.which == 13) {
					$("#savePage").click();
					e.stopPropagation();
				}
			})
			.mousedown(function(e){
				if ( !$("#pagename").is(":focus") ) {
					$("#pagename").select().focus();
            		e.preventDefault();
				}
			});
		}); 
		$("#popupContent").show();
	}	
}

function messageParser (request, sender, sendResponse) {
	if ( (request.message == "initSingleFile") && !location.hash ) {
		dropboxClient = chrome.extension.getBackgroundPage().dropboxClient;
		initSingleFile();
	}
	else if (request.message == "initDropboxError") {
		$("#dialog").attr("title", "Error!")
		.text("Error : " + request.error.responseText + ". Could not connect to Dropbox.")
		.dialog({buttons: {	
			"Try again": function(){
				$(this).dialog("close");
				initDropbox();
			},
			"Cancel": closePopup 
		}, closeOnEscape: false, modal: true, resizable: false });
	}
}


function initDropbox(scopeSandbox) {
	if (isPopup()) {
		if (scopeSandbox) {
			// It is necessary to perform the authentication process in the background page
			// Otherwise, if the popup were closed in the middle of the authentication process,
			// a new authorization from the user would be required to accede to his dropbox
			chrome.extension.sendMessage({message: "initDropbox"});
		}
		else {
			$("#dialog").attr("title", "Acces request to your Dropbox")
			.html("<p>Please define the level of access to your Dropbox this extension will enjoy :</p>"
				+ "<table><tbody>"
				+ "<tr><td><input id='sandbox' name='access' type='radio' " + ((scopeSandbox !== "fullaccess") ? "checked" : "")
				+ "></td><td>Access to a dedicated folder only (sandbox)</td></tr>"
				+ "<tr><td><input id='full' name='access' type='radio' " + ((scopeSandbox !== "fullaccess") ? "" : "checked")
				+ "></td><td>Full access to your Dropbox</td></tr>"
				+ "</tbody></table>"
				+ "<p>Please note that you can change this option at any time by clicking "
				+ "on the Log off button and then relogging to your account.")
			.dialog({closeOnEscape: false, modal: true, resizable: false, buttons : {
				"Ok" : function() {
					if ($("#dialog #sandbox").prop("checked")){
						scopeSandbox = "sandbox";
					}
					else {
						scopeSandbox = "fullaccess";
					}
					chrome.storage.local.set({"scopeSandbox": scopeSandbox});
					$(this).dialog("close");
					chrome.extension.sendMessage({message: "initDropbox"});
				},
				"Cancel" : function() { closePopup(); },
			} });
		}
	}
	else { // was called after a redirection from Dropbox site
		var appKey;
		if (scopeSandbox == "fullaccess") {
			appKey = { key: "Rh+OOZopQWA=|/l2LorDndi6WTlJ9pvMTWDGhJXJVIM0RREIFzMzM1g==", sandbox: false };
		}
		else {
			appKey = { key: "xfiZVeKWR3A=|lzFZIO70hXvPKMHfHDm9fdgrL27H0sEvRW9SZJ/14g==", sandbox: true };
		}
		var client = new Dropbox.Client(appKey);
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
			rememberUser: true,
			scope: scopeSandbox
		}));
		client.authenticate(function(error, data) {
	 	   	if (error) {
  		  		return $("#dialog").attr("title", "Error!")
				.text(error + ". Could not connect to Dropbox.")
				.dialog({buttons: {	
					"Try again": initDropbox,
					"Cancel": closeCurrentTab 	
				}, closeOnEscape: false, modal: true, resizable: false });
   			}
	 		// Success
 			chrome.extension.getBackgroundPage().dropboxClient = client;
   			$("#dialog").attr("title", "Scrap2Drop")
			.text("Thank you for allowing access to your dropbox."
				 +" You can now start archiving pages by clicking on Scrap2Drop icon.")
			.dialog({buttons: {
				"Ok": function() { closeCurrentTab(); }
			}, closeOnEscape: false, modal: true, resizable: false });
		});
	}
}

function initSingleFile() {
	var img = new Image();
	img.src = "chrome-extension://jemlklgaibiijojffihnhieihhagocma/resources/icon_16.png";
	img.onload = function() {
		init("Scrap2Drop");
	};
	img.onerror = function() {
		$("#dialog").attr("title", "Component required")
		.text("Please install SingleFile Core before using this extension.")
		.dialog({buttons: {
			"Ok": function(){ chrome.tabs.create({url : "https://chrome.google.com/webstore/detail/jemlklgaibiijojffihnhieihhagocma"}); },
			"Cancel" : function() { closePopup(); }
		}, closeOnEscape: false, modal: true, resizable: false });
	};
}

function logoff() {
	$("#dialog").attr("title", "Confirmation required")
	.text("Are you sure you want to log off from Dropbox ? "
		+ "If you do, you will have to give a new authorization before this extension is allowed to access to your dropbox again.")
	.dialog({buttons: {
		"Yes": function(){ dropboxClient.signOut(function() {
			chrome.storage.local.remove("scopeSandbox");
			$("#dialog").attr("title", "Log off successful")
			.text("You have successfully logged off from Dropbox.")
			.dialog({buttons: {"Ok" : closePopup}, closeOnEscape: false, modal: true, resizable: false});
		}) },
		"No" : function() { $(this).dialog("close"); }
	}, closeOnEscape: false, modal: true, resizable: false });
}

function openDropbox() {
	chrome.tabs.create( {url: "https://www.dropbox.com/home/Apps/Scrap2Drop"
		+ $("#tree").jstree("get_selected").attr("path") });
}

function loadTreeDownTo(path, currentNode, recursive) {
	if (!currentNode) {
		currentNode = $("#hiddenTree #Scrap2DropRoot");
		readdirCalls = readdirCompleted = 0;
		recursive = true;
	}
	var currentPath = currentNode.attr("path");
	readdirCalls++;
	dropboxClient.readdir(currentPath, function(error, entries, dir_stat, entry_stats) {
		if (error) {
			showError(error, true);
		}	
		currentNode.attr("loaded", true);
		for (var i in entry_stats) {
			if (entry_stats[i].isFolder) {
				if (!currentNode.children("ul").length) {
					currentNode.append("<ul></ul>");
				}
				var itemPath = currentPath + entry_stats[i].name + "/";
				var item = $("<li path='" + itemPath + "'><a href='#'>" + entry_stats[i].name + "</a></li>")
					.appendTo(currentNode.children("ul"));
				var r;
				if (recursive) {
					if ( (path.slice( 0, itemPath.length ) == itemPath) && (path !== itemPath) ) {
						r = true;
					}
					loadTreeDownTo(path, item, r);
				}
			}
		}
		if (currentPath == path) {
			currentNode.attr("id", "lastsel");
		}
		readdirCompleted++;
		if (readdirCalls == readdirCompleted) {
			renderTree();
		}
	});
}

function loadChildrenOf(node) {
	node.find("li").each(function(index, el){
		if ( !$(el).attr("loaded") ) {
			var path = $(el).attr("path");
			dropboxClient.readdir(path, function(error, entries, dir_stat, entry_stats) {
				if (error) {
					showError(error, true);
				}	
				$(el).attr("loaded", true);
				for (var i in entry_stats) {
					if (entry_stats[i].isFolder) {
						$("#tree").jstree("create_node", $(el), "inside", {
							attr: {path: path + entry_stats[i].name + "/"},
							data: entry_stats[i].name
						});
					}
				}
			});
		}
	});
}

function renderTree() {
	$("#tree").jstree("destroy")
	.jstree({
		"html_data" : {"data" : $("#hiddenTree > ul").html()},
		"themes": {"theme": "classic"},
		"ui": {
			"initially_select": [ "lastsel" ],
			"select_limit": 1
		},
		"plugins": ["html_data", "sort", "themes", "ui"]
	})
	.bind("select_node.jstree", function(event, data){
		var lastsel = $(data.args[0]).parent().attr("path");
		chrome.storage.local.set({"lastsel": lastsel});
	})
	.bind("open_node.jstree", function(event, data){
		loadChildrenOf($(data.args[0]));
	});
}

function addFolder() {
	$("#dialog").attr("title", "Add a folder")
	.html("<label>Please enter the name of the folder</label><br>"
		+ "<input id='folderName' type='text' style='width: 100%;'>")
	.keydown(function(e){
		if (e.which == 13) { 
			var buttons = $(this).dialog('option', 'buttons');
         	buttons["Ok"]();
         	e.stopPropagation();
		}
	})
	.dialog({modal: true, resizable: false, buttons : {
		"Ok" : function() {
			$("#dialog").unbind("keydown");
			var folderName = filterName($("#folderName").val());
			if (folderName) {
				// Init
				var sel = $("#tree").jstree("get_selected");
				var path = $("#tree").jstree("get_path", sel);
				if (path.length > 1) {
					path.shift();
					path = path.join("/");
					path = "/" + path;
				}
				else {
					path = "";
				}
				// Create folder on Dropbox
				dropboxClient.mkdir(path + "/" + folderName, function(error, stat) {
					if (error) {showError(error);}
					// Create Node
					addNode(sel, folderName, true);
				});
				// Close dialog
				$("#dialog").dialog("close");
			}
			else {
				$(this).dialog("close");
	    		$("#dialog").attr("title", "Error")
				.text("Invalid folder name.")
				.dialog({buttons: {
					"Ok": function() { $(this).dialog("close"); }
				}, modal: true, resizable: false });
			}	
		},
		"Cancel" : function() { $(this).unbind("keydown").dialog("close"); },
	} });
}

function savePage() {
}

// MAIN
chrome.extension.onMessage.addListener(messageParser);
$(function(){
	init();
});

// FOR DEBUG ONLY
var x;