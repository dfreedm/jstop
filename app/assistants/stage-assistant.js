function StageAssistant() {
}

StageAssistant.prototype.setup = function() {
    var stageController = this.controller.getAppController().getStageController("Top");
    if (stageController){
        stageController.window.focus();
    }
    else {
        this.controller.pushScene("Top");
    }
}
