// Unused code

function loadTree(path) {
	var node;
	if (!path) {
		path = "/";
		readdirCalls = readdirCompleted = 0;
	};
	node = $("#hiddenTree [path='" + path + "']");
	readdirCalls++;
	dropboxClient.readdir(path, function(error, entries, dir_stat, entry_stats) {
		if (error) {
			showError(error, true);
		}
		for (var i in entry_stats) {
			if (entry_stats[i].isFolder) {
				if (!node.children("ul").length) {
					node.append("<ul></ul>");
				}
				node.children("ul").append("<li path='" + path + entry_stats[i].name
					+ "/'><a href='#'>" + entry_stats[i].name + "</a></li>");
				loadTree(path + entry_stats[i].name + "/");
			}
		}
		readdirCompleted++;
		if (readdirCalls == readdirCompleted) {
			renderTree();
		}
	});
}
