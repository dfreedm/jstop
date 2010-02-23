function TopAssistant() {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
}

TopAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */
	this.cookie = new Mojo.Model.Cookie("jstop");
	this.prefs = this.cookie.get();
	if (this.prefs == null) {
		var temp = {autoGC:false};
		this.cookie.put(temp);
		this.prefs = temp;
	}

	/* use Mojo.View.render to render view templates and add them to the scene, if needed. */

	/* setup widgets here */
	Mojo.Log.info("Set up attributes");

	/* Make the list uneditable by the user */
	this.listAttributes = {
		// Template for how to display list items
		itemTemplate: 'Top/itemTemplate',
		swipeToDelete: true,
		autoConfirmDelete: true,
		reorderable: false,
		fixedHeightItems: true,
		preventDeleteProperty: "nokill"
	};
	Mojo.Log.info("Set up list model");

	/* Set a fake item, Give a title to the list */
	this.listModel = {
		listTitle: 'Running Processes',
		items: [{process:"broken.this has broken",pid:"9999",nodes:"-1",serviceHandles:0,nokill:true}]
	};

	/* Create the list widget */
	this.controller.setupWidget("top_list",this.listAttributes,this.listModel);

	/* Create the app menu */
	this.menuAutoGCEnable = {label:"Yes",command:"auto"};
	this.menuAutoGCDisable = {label:"No",command:"noauto"};
	var f = this.enableAuto.bind(this);
	f(this.prefs.autoGC);
	this.controller.setupWidget(Mojo.Menu.appMenu,this.menuAttributes={omitDefaultItems:true},this.menuModel={
		visible:true,
		items:[
			{label:"Sort by open service handles",command:"sh"}
			,{label:"Sort by memory usage",command:"mem"}
			,{label:"Garbage Collect JavaScript Heap",command:"gc"}
			,{label:"Auto Garbage Collect?",items:[this.menuAutoGCEnable,this.menuAutoGCDisable]}
		]
	});
	/* add event handlers to listen to events from widgets */

	/* Set up the listener for tapping on list items */
	this.controller.listen("top_list", Mojo.Event.listTap, this.handleTap.bind(this));
	/* swipe to delete will kill the app (auto confirmation) */
	this.controller.listen("top_list", Mojo.Event.listDelete, this.killProcess.bind(this));
	/* Default sort preference is by # of open service handles */
	this.sortPref = "serviceHandles";
	/* Holder of the last process list, keep it around so reordering list doesn't need to poll lunastats */
	this.lastList = {};
	/* Set up an auto GC interval if requested */
	// Default to 5 minutes
	this.timeout = (5*1000*60);
}

/* handler for app menu buttons */
TopAssistant.prototype.handleCommand = function(event) {
	var f = this.appendList.bind(this);
	if (event.type === Mojo.Event.command)
	{
		switch(event.command)
		{
			case 'gc':
				f = this.garbageCollect.bind(this);
				f();
				break;
			case 'sh':
				this.sortPref = "serviceHandles";
				f(this.lastList);
				break;
			case 'mem':
				this.sortPref = "nodes";
				f(this.lastList);
				break;
			case 'auto':
				f = this.enableAuto.bind(this);
				f(true);
				break;
			case 'noauto':
				f = this.enableAuto.bind(this);
				f(false);
				break;
			default: break;
		}
	}
	/* If a swipe forward is seen, unfilter the list */
	else if (event.type === Mojo.Event.forward) {
		/* Unfilter */
		this.filter = undefined;
		f(this.lastList);
	}
}

/* Enable auto gc? */
TopAssistant.prototype.enableAuto = function(event) {
	if (event === true){
		this.menuAutoGCEnable.disabled = true;
		this.menuAutoGCDisable.disabled = false;
	}
	else {
		this.menuAutoGCEnable.disabled = false;
		this.menuAutoGCDisable.disabled = true;
	}
	this.prefs.autoGC = event;
	this.cookie.put(this.prefs);
}

/* Command to garbage collect the heap */
TopAssistant.prototype.garbageCollect = function() {
	Mojo.Log.info("GC'ing javascript heap");
	this.controller.serviceRequest('palm://com.palm.lunastats',{
		method: 'gc',
		parameters: {},
		onComplete: this.appendList.bind(this)
	});
}

/* Handle the tap on the list item */
TopAssistant.prototype.handleTap = function(event) {
	if (event.item.process != '<Anon>'){
		this.filter = event.item.url;
		var f = this.appendList.bind(this);
		f(this.lastList);
	}
}

/* Say we are GC'ing automagically */
TopAssistant.prototype.autoGC = function() {
	if (this.prefs.autoGC){
		var f = this.fireBanner.bind(this);
		f("Auto GC'ing");
		f = this.garbageCollect.bind(this);
		f();
	}
}

/* Fire a banner */
TopAssistant.prototype.fireBanner = function(app) {
	var bannerParams = {messageText: app};
	this.controller.showBanner(bannerParams, {}, "");
}

/* Kills an app by pid# */
TopAssistant.prototype.killProcess = function(event) {
	/* Make sure the click event came from a list item */
	Mojo.Log.info("Going to kill pid: " + event.item.pid);
	/* Call the Application Manager to kill the selection process */
	this.controller.serviceRequest('palm://com.palm.applicationManager', {
		method: 'close',
		/* The pid is used as the processId */
		parameters: {processId:event.item.pid},
		/* Redraw the list on success */
		onSuccess: this.updateList.bind(this),
		/* Do nothing on failure. This operation should NEVER FAIL */
		onFailure: function(){Mojo.Log.error("OH GOD A CLOSE FAILED");}
	});
}

TopAssistant.prototype.activate = function(event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
	
	/* Update the list with real info */
	this.interval = setInterval(this.autoGC.bind(this),this.timeout);
	var f = this.updateList.bind(this);
	f();
}


TopAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
	clearInterval(this.interval);
}

TopAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
}

/* Calls the service which knows about application statistics */
TopAssistant.prototype.updateList = function() {
	/* Message com.palm.lunastats to give the VM stats */
	this.controller.serviceRequest('palm://com.palm.lunastats', {
		method: 'getStats',
		parameters: {subscribe:true},
		//For some reason, onSuccess never happens :(
		onComplete: this.appendList.bind(this),
	});
}

/* Append the real processes to the Process List */
TopAssistant.prototype.appendList = function(event) {
	/* save event */
	this.lastList = event;
	/* regex for splitting the process name */
	var regPalm = new RegExp("^com.palm.[app\.]{0,4}(.*)?");
	var regApp = new RegExp("^(?:[^\.]+\.){2}(.*)?");
	/* sort by preference */
	var sorter = function (a,b) {
		var x = a;
		var y = b;
		if (this.sortPref == 'nodes')
		{
			x = parseInt(a.nodes);
			y = parseInt(b.nodes);
		}
		else if (this.sortPref == 'serviceHandles')
		{
			x = parseInt(a.serviceHandles);
			y = parseInt(b.serviceHandles);
		}
		else
		{
			return 0;
		}
		return ((x < y) ? 1 : (x > y) ? -1 : 0);
	}
	/* Array holding all the processes */
	var processes = new Array();
	var anonProcesses = new Array();
	/* Loop over all the processes */
	var docLength = event.documents.length;
	for (var i = 0; i < docLength; i++)
	{
		var app = event.documents[i];
		/* Break the appId into a separate process name and pid */
		var namePid = /([\w\.]+)\s(\d+)/.exec(app.appId);
		/* Check that the current appId matched the regex */
		var name = (namePid != null ? namePid[1] : "<Anon>");
		var pid = (namePid != null ? namePid[2] : "");
		/* Construct a JSON object that has the process name, pid, and node count numbers */
		var nameShort = name;
		var isPalm = false;
		var matchPalm = nameShort.match(regPalm);
		if (matchPalm) { nameShort = matchPalm[1]; isPalm = true; }
		var matchApp = nameShort.match(regApp);
		if (matchApp[1]) { nameShort = matchApp[1]; isPalm = false; }
		var str = {
			process:name
			,processShort:nameShort
			,processClass:(isPalm?'palm':'')
			,pid:pid
			,nodes:app.nodes
			,serviceHandles:app.openServiceHandles
			,nokill:(name == "<Anon>" ? true : false)
			,url:app.url
		};
		/* Append to processes array, filter if wanted */
		if (this.filter){
			if (app.url === this.filter){
				processes.push(str);
			}
		}
		else{
			if (str.nokill){
				anonProcesses.push(str);
			}else{
			processes.push(str);
		}
	}
	/* Sort list */
	processes = processes.sort(sorter.bind(this));
	anonProcesses = anonProcesses.sort(sorter.bind(this));
	/* Put anons at the end */
	for (var i in anonProcesses){
		processes = processes.push(anonProcesses[i]);
	}
	/* Add the list of processes to the GUI list */
	this.controller.get("top_list").mojo.setLength(processes.length);
	this.controller.get("top_list").mojo.noticeUpdatedItems(0,processes);

	/* Update the Title with JavaScript Heap info */
	/* 1.3.5 changed the JSON response, keeping backward compatibility with older devices */
	if (event.counters.jsHeap == undefined)
	{
		var jsHeapSize = event.counters.jsHeapSize;
		var jsHeapCapacity = event.counters.jsHeapCapacity;
	}
	else
	{
		var jsHeapSize = event.counters.jsHeap.used;
		var jsHeapCapacity = event.counters.jsHeap.capacity;
	}
	//TODO: Useful metrics in new event.counters.jsHeap: see full_counter_api.txt
	this.controller.get("heap_progress").update(this.formatSize(jsHeapSize));
	this.controller.get("heap_progress").style.width = Math.round((jsHeapSize/jsHeapCapacity) * 100) + 'px';
};

/* format bytes to easier to read value */
TopAssistant.prototype.formatSize = function(size)
{
	var toReturn = size + ' B';
	var formatSize = size;
	
	if (formatSize > 1024)
	{
		formatSize = (Math.round((formatSize / 1024) * 100) / 100);
		toReturn = formatSize + ' KB';
	}
	if (formatSize > 1024)
	{
		formatSize = (Math.round((formatSize / 1024) * 100) / 100);
		toReturn = formatSize + ' MB';
	}
	// I don't think we need to worry about GB here...
	
	// return formatted size
	return toReturn;
}

/* Unfilter the list */
TopAssistant.prototype.unfilter = function(){
	if (this.filter){
		this.filter = undefined;
	}
}
