function TopAssistant() {
	/* Bind all the functions at instantiation */
	var bindThese = ["setupAutoGC","removeAutoGC","toggleNotifications","enableAuto","garbageCollect","autoGC","fireBanner","killProcess","updateList","appendList","formatSize","unfilter"];
	var binder = function(f) {
		this[f] = this[f].bind(this);
	}.bind(this);
	bindThese.forEach(binder);
}

TopAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */
	this.cookie = new Mojo.Model.Cookie("jstop");
	this.prefs = this.cookie.get();
	if (!this.prefs) {
		var temp = {autoGC:false,notif:true};
		this.cookie.put(temp);
		this.prefs = temp;
	}

	/* use Mojo.View.render to render view templates and add them to the scene, if needed. */

	/* setup widgets here */
	/* Make the list uneditable by the user */
	this.topListAttributes = {
		// Template for how to display list items
		itemTemplate: 'Top/itemTemplate',
		swipeToDelete: true,
		autoConfirmDelete: true,
		reorderable: false,
		fixedHeightItems: true,
		preventDeleteProperty: "nokill"
	};

	/* Set a fake item, Give a title to the list */ 
	this.topListModel = {
		listTitle: 'Running Processes',
		items: [{process:"broken.this has broken",pid:"9999",nodes:"-1",serviceHandles:0,nokill:true}]
	};

	/* Create the list widget */
	this.controller.setupWidget("top_list",this.topListAttributes,this.topListModel);

	/* Create the app menu */
	this.menuAutoGC = {label:"Enable Auto GC",command:"autogc"};
	if (this.prefs.autoGC){
		this.menuAutoGC.label = "Disable Auto GC";
	}
	this.notifications = {label:"Enable Notifications",command:"notif"};
	if (this.prefs.notif){
		this.notifications.label = "Disable Notifications";
	}
	this.controller.setupWidget(Mojo.Menu.appMenu,this.menuAttributes={omitDefaultItems:true},this.menuModel={
		visible:true,
		items:[
			{label:"Sort by open service handles",command:"sh"},
			{label:"Sort by memory usage",command:"mem"},
			{label:"Garbage Collect JavaScript Heap",command:"gc"},
			this.notifications,
			this.menuAutoGC
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
};

/* Set the alarm for autoGC */
TopAssistant.prototype.setupAutoGC = function(){
	this.controller.serviceRequest('palm://com.palm.power/timeout',
		{
			method: "set",
			parameters:{
				key:"com.palm.biz.sketchyplace.jstop.timeout",
				wakeup:false,
				uri:"palm://com.palm.applicationManager/launch",
				params:{
					id:"com.palm.biz.sketchyplace.jstop",
					params:{action:"doGC"}
				},
				'in':"00:05:00"
			},
		onSuccess:function(){Mojo.Log.info("set up");},
		onFailure:function(event){Mojo.Log.info(event.errorText);}
		});
};

/* Remove the alarm */
TopAssistant.prototype.removeAutoGC = function(){
	this.controller.serviceRequest('palm://com.palm.power/timeout',
		{
			method:"clear",
			parameters:{
				key:"com.palm.biz.sketchyplace.jstop.timeout"
			},
			onSuccess:function(){Mojo.Log.info("cleared");},
			onFailure:function(event){Mojo.Log.info(event.errorText);}
		});
};

/* handler for app menu buttons */
TopAssistant.prototype.handleCommand = function(event) {
	if (event.type === Mojo.Event.command)
	{
		switch(event.command)
		{
			case 'gc':
				this.garbageCollect();
				break;
			case 'sh':
				this.sortPref = "serviceHandles";
				this.appendList(this.lastList);
				break;
			case 'mem':
				this.sortPref = "nodes";
				this.appendList(this.lastList);
				break;
			case 'autogc':
				this.enableAuto();
				break;
			case 'notif':
				this.toggleNotifications();
				break;
			default: break;
		}
	}
	if (event.type === Mojo.Event.back) {
		event.stop();
		this.unfilter();
		this.appendList(this.lastList);
	}
};

/* Show notifications? */
TopAssistant.prototype.toggleNotifications = function(){
	if(this.prefs.notif){
		this.notifications.label = "Enable Notifications";
		this.prefs.notif = false;
	}else{
		this.notifications.label = "Disable Notifications";
		this.prefs.notif = true;
	}
	this.cookie.put(this.prefs);
};

/* Enable auto gc? */
TopAssistant.prototype.enableAuto = function(event) {
	this.prefs.autoGC = !this.prefs.autoGC;
	this.cookie.put(this.prefs);
	if (this.prefs.autoGC){
		this.setupAutoGC();
		this.menuAutoGC.label = "Disable Auto GC";
	}else{
		this.removeAutoGC();
		this.menuAutoGC.label = "Enable Auto GC";
	}
};

/* Command to garbage collect the heap */
TopAssistant.prototype.garbageCollect = function() {
	Mojo.Log.info("GC'ing javascript heap");
	// Do it twice to clear out dangling references (v8 oddity)
	var secondRound = function(){
		this.controller.serviceRequest('palm://com.palm.lunastats',{
			method: 'gc',
			parameters: {},
			onComplete: this.appendList});
	};
	secondRound = secondRound.bind(this);
	this.controller.serviceRequest('palm://com.palm.lunastats',{
		method: 'gc',
		parameters: {},
		onComplete: secondRound
	});
};

/* Handle the tap on the list item */
TopAssistant.prototype.handleTap = function(event) {
	if (!this.filter){
		this.filter = event.item.processShort;
		this.appendList(this.lastList);
	}
	else {
		this.controller.showAlertDialog({
			onChoose:Mojo.doNothing,
			title:"More info",
			message: ("appId: " + event.item.appId + "\n" + "URL: " + event.item.url),
			choices: [{label:"Close",value:"who cares",type:'dismiss'}]
		});
	}
};

/* Say we are GC'ing automagically */
TopAssistant.prototype.autoGC = function() {
	if (this.prefs.autoGC){
		this.fireBanner("Auto GC'ing");
		this.garbageCollect();
	}
};

/* Fire a banner */
TopAssistant.prototype.fireBanner = function(app) {
	var bannerParams = {messageText: app};
	this.controller.showBanner(bannerParams, {}, "");
};

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
		onSuccess: this.updateList,
		/* Do nothing on failure. This operation should NEVER FAIL */
		onFailure: function(){Mojo.Log.info("OH GOD A CLOSE FAILED");}
	});
};

TopAssistant.prototype.activate = function(event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
	
	/* Set up an auto GC interval if requested */
	if (this.prefs.autoGC){
		this.setupAutoGC();
	}
	/* Update the list with real info */
	this.updateList();
};


TopAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
};

TopAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
	/* Close everything if no autoGC */
	if (!this.prefs.autoGC){
		Mojo.Controller.getAppController().closeAllStages();
	}
};

/* Calls the service which knows about application statistics */
TopAssistant.prototype.updateList = function() {
	/* Message com.palm.lunastats to give the VM stats */
	this.controller.serviceRequest('palm://com.palm.lunastats', {
		method: 'getStats',
		parameters: {subscribe:true},
		//For some reason, onSuccess never happens :(
		onComplete: this.appendList
	});
};

/* Append the real processes to the Process List */
TopAssistant.prototype.appendList = function(event) {
	/* save event */
	this.lastList = event;
	/* regex for splitting the process name */
	var regPalm = new RegExp("^com\\.palm\\.(?:app\\.)?(.*)?");
	var regApp = new RegExp("^(?:[^\\.]+\\.){2}(.*)?");
	var regNamePid = new RegExp("(.+)\\s(\\d+)");
	/* sort by preference */
	var sorter = function (a,b) {
		var x = a;
		var y = b;
		if (this.sortPref == 'nodes')
		{
			x = parseInt(a.nodes,10);
			y = parseInt(b.nodes,10);
		}
		else if (this.sortPref == 'serviceHandles')
		{
			x = parseInt(a.serviceHandles,10);
			y = parseInt(b.serviceHandles,10);
		}
		else
		{
			return 0;
		}
		return ((x < y) ? 1 : (x > y) ? -1 : 0);
	};
	/* Array holding all the processes */
	var processes = [];
	var anonProcesses = [];
	/* Loop over all the processes */
	var docLength = event.documents.length;
	/* Filter processes array, if filter is set */
	var procFilter = function(app){
		if (this.filter){
			return app.processShort === this.filter;
		}else{
			return true;
		}
	};
	for (var i = 0; i < docLength; i++)
	{
		var app = event.documents[i];
		/* Break the appId into a separate process name and pid */
		var namePid = app.appId.match(regNamePid);
		/* Check that the current appId matched the regex */
		if (namePid) {
			var name = namePid[1];
			var pid = namePid[2];
			/* Construct a JSON object that has the process name, pid, and node count numbers */
			var nameShort = name;
			var isPalm = false;
			var matchPalm = nameShort.match(regPalm); if (matchPalm) { nameShort = matchPalm[1]; isPalm = true; }
			var matchApp = nameShort.match(regApp);
			if (matchApp && matchApp[1]) { nameShort = matchApp[1]; isPalm = false; }
			var str = {
				process:name,
				processShort:nameShort,
				processClass:(isPalm?'palm':''),
				pid:pid,
				nodes:app.nodes,
				serviceHandles:app.openServiceHandles,
				url:app.url,
				appId:app.appId
			};
			/* about:blank is not useful */
			if (app.url !== "about:blank"){
				processes.push(str);
			}
		}
	}
	/* Sort list */
	processes = processes.sort(sorter.bind(this));
	/* Filter processes */
	processes = processes.filter(procFilter.bind(this));
	/* Add the list of processes to the GUI list */
	this.controller.get("top_list").mojo.setLength(processes.length);
	this.controller.get("top_list").mojo.noticeUpdatedItems(0,processes);
	/* Update the Title with JavaScript Heap info */
	/* 1.3.5 changed the JSON response, keeping backward compatibility with older devices */
	var jsHeapSize, jsHeapCapacity;
	if (typeof event.counters.jsHeap === "undefined")
	{
		jsHeapSize = event.counters.jsHeapSize;
		jsHeapCapacity = event.counters.jsHeapCapacity;
	}
	else
	{
		jsHeapSize = event.counters.jsHeap.used;
		jsHeapCapacity = event.counters.jsHeap.capacity;
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
};

/* Unfilter the list */
TopAssistant.prototype.unfilter = function(){
	if (this.filter) {
		this.filter = undefined;
	}
};
