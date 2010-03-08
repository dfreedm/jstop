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
		var temp = {autoGC:false,notif:true};
		this.cookie.put(temp);
		this.prefs = temp;
	}

	/* use Mojo.View.render to render view templates and add them to the scene, if needed. */

	/* setup widgets here */
	/* Make the list uneditable by the user */
	this.topListAttributes = {
		// Template for how to display list items
		itemTemplate: 'Top/itemTemplate'
		,swipeToDelete: true
		,autoConfirmDelete: true
		,reorderable: false
		,fixedHeightItems: true
		,preventDeleteProperty: "nokill"
	};

	/* Set a fake item, Give a title to the list */ 
	this.topListModel = {
		listTitle: 'Running Processes',
		items: [{process:"broken.this has broken",pid:"9999",nodes:"-1",serviceHandles:0,nokill:true}]
	};

	/* Create the list widget */
	this.controller.setupWidget("top_list",this.topListAttributes,this.topListModel);

	/* Create the app menu */
	this.menuAutoGC = {command:"autogc"};
	if (this.prefs.autoGC){
		this.menuAutoGC.label = "Disable Auto GC";
	}else{
		this.menuAutoGC.label = "Enable Auto GC";
	}
	this.defilterItem = {label:"Unfilter List",command:"unfilter"};
	this.defilterItem.disabled = true;
	this.notifications = {label:"Disable Notifications",command:"notif"};
	this.controller.setupWidget(Mojo.Menu.appMenu,this.menuAttributes={omitDefaultItems:true},this.menuModel={
		visible:true,
		items:[
			{label:"Sort by open service handles",command:"sh"}
			,{label:"Sort by memory usage",command:"mem"}
			,{label:"Garbage Collect JavaScript Heap",command:"gc"}
			,this.defilterItem
			,this.notifications
			,this.menuAutoGC
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
}

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
		onSuccess:function(){Mojo.Log.info("set up")},
		onFailure:function(event){Mojo.Log.info(event.errorText)}
		});
}

/* Remove the alarm */
TopAssistant.prototype.removeAutoGC = function(){
	this.controller.serviceRequest('palm://com.palm.power/timeout',
		{
			method:"clear",
			parameters:{
				key:"com.palm.biz.sketchyplace.jstop.timeout"
			},
			onSuccess:function(){Mojo.Log.info("cleared")},
			onFailure:function(event){Mojo.Log.info(event.errorText)}
		});
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
			case 'autogc':
				f = this.enableAuto.bind(this);
				f();
				break;
			case 'unfilter':
				var q = this.unfilter.bind(this);
				q();
				f(this.lastList);
				break;
			case 'notif':
				f = this.toggleNotifications.bind(this);
				f();
				break;
			default: break;
		}
	}
}

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
}

/* Enable auto gc? */
TopAssistant.prototype.enableAuto = function(event) {
	this.prefs.autoGC = !this.prefs.autoGC;
	this.cookie.put(this.prefs);
	var f;
	if (this.prefs.autoGC){
		f = this.setupAutoGC.bind(this);
		f();
		this.menuAutoGC.label = "Disable Auto GC";
	}else{
		f = this.removeAutoGC.bind(this);
		f();
		this.menuAutoGC.label = "Enable Auto GC";
	}
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
	var f = this.appendList.bind(this);
	if (!this.filter){
		this.filter = event.item.url;
		this.defilterItem.disabled = false;
		f(this.lastList);
	}
	else {
		this.controller.showAlertDialog({
			onChoose:Mojo.doNothing,
			title:"More info",
			message: ("appId: " + event.item.appId + "\n" + "URL: " + event.item.url),
			choices: [{label:"Close",value:"who cares",type:'dismiss'}]
		});
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
		onFailure: function(){Mojo.Log.info("OH GOD A CLOSE FAILED");}
	});
}

TopAssistant.prototype.activate = function(event) {
	/* put in event handlers here that should only be in effect when this scene is active. For
	   example, key handlers that are observing the document */
	
	/* Set up an auto GC interval if requested */
	if (this.prefs.autoGC){
		var f = this.setupAutoGC.bind(this);
		f();
	}
	/* Update the list with real info */
	f = this.updateList.bind(this);
	f();
}


TopAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
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
	var regPalm = new RegExp("^com.palm.(?:app\.)?(.*)?");
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
	var processes = [];
	var anonProcesses = [];
	/* Loop over all the processes */
	var docLength = event.documents.length;
	for (var i = 0; i < docLength; i++)
	{
		var app = event.documents[i];
		try{
			/* Break the appId into a separate process name and pid */
			var namePid = /(.+)\s(\d+)/.exec(app.appId);
			/* Check that the current appId matched the regex */
			var name = (namePid === null ? "BROKEN" : namePid[1]);
			var pid = (namePid === null ? "BORK" : namePid[2]);
			/* Construct a JSON object that has the process name, pid, and node count numbers */
			var nameShort = name;
			var isPalm = false;
			var matchPalm = nameShort.match(regPalm); if (matchPalm) { nameShort = matchPalm[1]; isPalm = true; }
			var matchApp = nameShort.match(regApp);
			if (matchApp[1]) { nameShort = matchApp[1]; isPalm = false; }
			var str = {
				process:name
				,processShort:nameShort
				,processClass:(isPalm?'palm':'')
				,pid:pid
				,nodes:app.nodes
				,serviceHandles:app.openServiceHandles
				,url:app.url
				,appId:app.appId
			};
			processes.push(str);
		} catch (err) {
			processes.push({processShort:"BORKED",pid:"BRK",nodes:-1,serviceHandles:-1,nokill:true,appId:app.appId,url:app.url});
		}
	}
	/* Filter processes array, if filter is set */
	var procFilter = function(app){
		if (this.filter){
			return app.url === this.filter;
		}else{
			return true;
		}
	};
	/* Sort list */
	processes = processes.sort(sorter.bind(this));
	/* Filter processes */
	processes = processes.filter(procFilter.bind(this));
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
}


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
		this.defilterItem.disabled = true;
	}
}
