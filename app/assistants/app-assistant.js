function AppAssistant() {
}

AppAssistant.prototype.setup = function(){
}

// Handle relaunch with parameters
AppAssistant.prototype.handleLaunch = function(launchParams) {
    this.cookie = new Mojo.Model.Cookie("jstop");
    this.prefs = this.cookie.get();
    if (this.prefs == null) {
        var temp = {autoGC:false,notif:true};
        this.cookie.put(temp);
        this.prefs = temp;
    }
    // Create a new stage not attached the to dashboard
    var cardStageController = this.controller.getStageController("JSTop");
    var appController = Mojo.Controller.getAppController();
    Mojo.Log.error("App Params: " + launchParams);
    // Probably launched from launcher
    if (!launchParams){
        if (cardStageController){
            cardStageController.popScenesTo("Top");
            cardStageController.activate();
        }
        // Don't spawn another card
        else{
            var stageArguments = {name:"JSTop",lightweight:true};
            var pushMain = function(stageController){
                stageController.pushScene("Top");
            };
            this.controller.createStageWithCallback(stageArguments,pushMain.bind(this),"card");
        }
    }
    // Launched from alarm
    else {
        switch(launchParams.action){
            case "doGC":
                var f = this.doGC.bind(this);
                f();
                f = this.fireBanner.bind(this);
                f();
                f = this.setWakeup.bind(this);
                f();
            break;
        }
    }
}

// Setup the next alarm
AppAssistant.prototype.setWakeup = function(){
    Mojo.Log.info("Setting up next wakeup");
    this.wakeup = new Mojo.Service.Request('palm://com.palm.power/timeout',
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
        onSuccess:function(){Mojo.Log.error("set up")},
        onFailure:function(event){Mojo.Log.error(event.errorText)}
    });
}

// Launch a gc
AppAssistant.prototype.doGC = function(){
    Mojo.Log.info("GC'ing");
    this.gc = new Mojo.Service.Request('palm://com.palm.lunastats',{
        method: 'gc',
        parameters: {},
        onComplete: Mojo.doNothing
    });
}

// Fire the banner
AppAssistant.prototype.fireBanner = function() {
    Mojo.Log.info("Fire banner");
    // only if the user wants notifications
    if (this.prefs.notif){
        var bannerParams = {messageText: "Auto GC'ed"};
        this.controller.showBanner(bannerParams, {}, "");
    }
}
