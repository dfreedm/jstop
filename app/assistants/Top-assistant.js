function TopAssistant() {
	/* this is the creator function for your scene assistant object. It will be passed all the 
	   additional parameters (after the scene name) that were passed to pushScene. The reference
	   to the scene controller (this.controller) has not be established yet, so any initialization
	   that needs the scene controller should be done in the setup function below. */
}

TopAssistant.prototype.setup = function() {
	/* this function is for setup tasks that have to happen when the scene is first created */

	/* use Mojo.View.render to render view templates and add them to the scene, if needed. */

	/* setup widgets here */
	Mojo.Log.info("Set up attributes");

	/* Make the list uneditable by the user */
	this.listAttributes = {
		// Template for how to display list items
		itemTemplate: 'Top/itemTemplate',
		swipeToDelete: false,
		reorderable: false,
	};
	Mojo.Log.info("Set up list model");

	/* Set a fake item, Give a title to the list */
	this.listModel = {
		listTitle: 'Running Processes',
		items: [{process:"Something has gone horribly wrong",pid:"9999",nodes:"-1",serviceHandles:0}]
	};

	/* Create the list widget */
	this.controller.setupWidget("top_list",this.listAttributes,this.listModel);

	/* Create the app menu */
	this.controller.setupWidget(Mojo.Menu.appMenu,this.attributes={omitDefaultItems:true},this.model={
		visible:true,
		items:[
			{label:"Sort by open service handles",command:"sh"}
			,{label:"Sort by memory usage",command:"mem"}
			,{label:"Garbage Collect JavaScript Heap",command:"gc"}
		]
	});
	/* add event handlers to listen to events from widgets */

	/* Set up the listener for tapping on list items */
	this.controller.listen("top_list", Mojo.Event.listTap, this.handleTap.bind(this));
	/* Default sort preference is by # of open service handles */
	this.sortPref = "serviceHandles";
	//this.interval = setInterval(this.updateList.bind(this),5000);
	/* Holder of the last process list, keep it around so reordering list doesn't need to poll lunastats */
	this.lastList = {};
}

/* handler for app menu buttons */
TopAssistant.prototype.handleCommand = function(event) {
	var f = this.updateList.bind(this);
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
				f();
				break;
			case 'mem':
				this.sortPref = "nodes";
				f();
				break;
			default: break;
		}
	}
}

/* Command to garbage collect the heap */
TopAssistant.prototype.garbageCollect = function() {
	Mojo.Log.info("GC'ing javascript heap");
	this.controller.serviceRequest('palm://com.palm.lunastats',{
		method: 'gc',
		parameters: {},
		onComplete: function(){}
	});
}

/* Handle the tap on the list item */
TopAssistant.prototype.handleTap = function(event) {
	//if (event.originalEvent.target.tagName == "SPAN")
	//{
		var f = this.confirmKill.bind(this);
		f(event);
	//}
}

/* Confirm that you REALLY want to kill this item */
TopAssistant.prototype.confirmKill = function(event) {
	var f = this.killProcess.bind(this);
	var affirm = function(transport)
	{
		if (transport)
		{
			f(event);
		}
	}
	this.controller.showAlertDialog({
		onChoose:affirm,
		title:"Are you sure?",
		choices:[
			{label:"Kill it!",value:true,type:'affirmative'},
			{label:"No, don't do that!", value:false,type:'negative'}
		]
	});
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
	var f = this.updateList.bind(this);
	f();
}


TopAssistant.prototype.deactivate = function(event) {
	/* remove any event handlers you added in activate and do any other cleanup that should happen before
	   this scene is popped or another scene is pushed on top */
//	clearInterval(this.interval);
}

TopAssistant.prototype.cleanup = function(event) {
	/* this function should do any cleanup needed before the scene is destroyed as 
	   a result of being popped off the scene stack */
}

/* Calls the service which knows about application statistics */
TopAssistant.prototype.updateList = function() {
	//Mojo.Log.info("Attempt to get Luna VM stats");
	/* Message com.palm.lunastats to give the VM stats */
	this.controller.serviceRequest('palm://com.palm.lunastats', {
		method: 'getStats',
		parameters: {subscribe:true},
		//For some reason, onSuccess never happens :(
		onSuccess: this.appendList.bind(this),
		onFailure: this.popupBad.bind(this)
	});
}

/* Append the real processes to the Process List */
TopAssistant.prototype.appendList = function(event) {
	/* replay last process list if we just want to reorder list */
	if (event === undefined)
	{
		event = this.lastList;
	}
	/* regex for splitting the process name */
	var regPalm = new RegExp("^com.palm.[app\.]{0,4}(.*)?");
	var regApp = new RegExp("^[^\.]+\.[^\.]+\.(.*)?");
	/* sort by preference */
	var sorter = function (a,b) {
		var x = a;
		var y = b;
		//Mojo.Log.info("sortPref is: %s",this.sortPref);
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
	//Mojo.Log.info("Add processes to list");
	/* Loop over all the processes */
	var docLength = event.documents.length;
	for (var i = 0; i < docLength; i++)
	{
		/* Break the appId into a separate process name and pid */
		var namePid = /([\w.]+)\s(\d+)/.exec(event.documents[i].appId);
		/* Check that the current appId matched the regex */
		if (namePid)
		{
			/* Construct a JSON object that has the process name, pid, and node count numbers */
			var nameShort = namePid[1];
			var isPalm = false;
			var matchPalm = nameShort.match(regPalm);
			if (matchPalm) { nameShort = matchPalm[1]; isPalm = true; }
			var matchApp = nameShort.match(regApp);
			if (matchApp[1]) { nameShort = matchApp[1]; isPalm = false; }
			var str = {process:namePid[1],processShort:nameShort,processClass:(isPalm?'palm':''),pid:namePid[2],nodes:event.documents[i].nodes,serviceHandles:event.documents[i].openServiceHandles};
			/* Append to processes array */
			processes.push(str);
			//Mojo.Log.info("Process name: %s",str.process);
			//Mojo.Log.info("Pid: %s",str.pid);
		}
		else
		{
			Mojo.Log.info("Bad appId");
		}
	}
	//Mojo.Log.info("Sorting list");
	/* Sort list */
	processes = processes.sort(sorter.bind(this));
	//Mojo.Log.info("Pushing new items");
	/* Add the list of processes to the GUI list */
	this.controller.get("top_list").mojo.setLength(processes.length);
	this.controller.get("top_list").mojo.noticeUpdatedItems(0,processes);

	/* Update the Title with JavaScript Heap info */
	var jsHeapSize = event.counters.jsHeapSize;
	//Mojo.Log.info("HeapSize: " + jsHeapSize);
	var jsHeapCapacity = event.counters.jsHeapCapacity;
	//Mojo.Log.info("HeapCapacity: " + jsHeapCapacity);
	var jsRemaining = jsHeapCapacity - jsHeapSize;
	//Mojo.Log.info("Remaining: " + jsRemaining);
	var title = "Javascript Resource Monitor" + "<br/>Total Heap Size: " + jsHeapCapacity + "<br/>Heap Used: " + jsHeapSize + "<br/>Heap Left: " + jsRemaining;
	//Mojo.Log.info("New Title: " + title);
	//this.controller.get("top_header").update(title);
	this.controller.get("heap_progress").update(this.formatSize(jsHeapSize));
	this.controller.get("heap_progress").style.width = Math.round((jsHeapSize/jsHeapCapacity) * 100) + 'px';
	this.lastList = event;
};

/* Something bad happened getting the VM statistics */
TopAssistant.prototype.popupBad = function(event){
	Mojo.Log.info("Ah, what happened?");
	Mojo.Log.info("Got errorCode %s",event.errorCode);
	Mojo.Log.info("Got errorText %s",event.errorText);
	Mojo.Log.info("All parts");
	for (var method in event)
	{
		Mojo.Log.info(method);
	}
	/* popupBad gets called even though the call to lunastats succeded. WTF!!!
	 * Therefore, check if we got the json object we wanted */
	if (event.documents)
	{
		Mojo.Log.info(event.documents);
		var f = this.appendList.bind(this);
		f(event);
	}
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
