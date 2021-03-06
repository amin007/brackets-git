import { _, Dialogs, Mustache, NativeApp } from "./brackets-modules";
import * as ExpectedError from "./ExpectedError";
import * as ExtensionInfo from "./ExtensionInfo";
import * as Strings from "strings";
import * as Utils from "./Utils";

const markdownReportTemplate     = require("text!templates/error-report.md");
const errorDialogTemplate        = require("text!templates/git-error-dialog.html");

var errorQueue = [];

function getMdReport(params) {
    return Mustache.render(markdownReportTemplate, _.defaults(params || {}, {
        brackets: [brackets.metadata.name, brackets.metadata.version, "(" + brackets.platform + ")"].join(" "),
        bracketsGit: "Brackets-Git " + ExtensionInfo.getSync().version,
        git: Strings.GIT_VERSION
    })).trim();
}

function errorToString(err) {
    return Utils.encodeSensitiveInformation(err.toString());
}

export function rewrapError(err, errNew) {
    var oldText = "Original " + err.toString(),
        oldStack;
    if (err.stack) {
        if (err.stack.indexOf(err.toString()) === 0) {
            oldStack = "Original " + err.stack;
        } else {
            oldStack = oldText + "\n" + err.stack;
        }
    }
    if (typeof errNew === "string") {
        errNew = new Error(errNew);
    }
    errNew.toString = function () {
        return Error.prototype.toString.call(this) + "\n" + oldText;
    };
    errNew.stack += "\n\n" + oldStack;
    return errNew;
};

function _reportBug(params) {
    ExtensionInfo.hasLatestVersion(function (hasLatestVersion, currentVersion, latestVersion) {
        if (hasLatestVersion) {
            NativeApp.openURLInDefaultBrowser(params);
        } else {
            var err = new ExpectedError("Latest version of extension is " + latestVersion + ", yours is " + currentVersion);
            showError(err, "Outdated extension version!");
        }
    });
}

export function reportBug() {
    var mdReport = getMdReport({
        errorStack: errorQueue.map(function (err, index) {
            return "#" + (index + 1) + ". " + errorToString(err);
        }).join("\n")
    });
    _reportBug(ExtensionInfo.getSync().homepage + "/issues/new?body=" + encodeURIComponent(mdReport));
};

export function isTimeout(err) {
    return err instanceof Error && (
        err.message.indexOf("cmd-execute-timeout") === 0 ||
        err.message.indexOf("cmd-spawn-timeout") === 0
    );
};

export function equals(err, what) {
    return err.toString().toLowerCase() === what.toLowerCase();
};

export function contains(err, what) {
    return err.toString().toLowerCase().indexOf(what.toLowerCase()) !== -1;
};

export function matches(err, regExp) {
    return err.toString().match(regExp);
};

export function logError(err) {
    var msg = err && err.stack ? err.stack : err;
    Utils.consoleLog("[brackets-git] " + msg, "error");
    errorQueue.push(err);
    return err;
};

export function showError(err, title) {
    if (err.__shown) { return err; }

    logError(err);

    var dialog,
        errorBody,
        errorStack;

    var showDetailsButton = false;
    if (err.detailsUrl) {
        showDetailsButton = true;
    }

    if (typeof err === "string") {
        errorBody = err;
    } else if (err instanceof Error) {
        errorBody = errorToString(err);
        errorStack = err.stack || "";
    }

    if (!errorBody || errorBody === "[object Object]") {
        try {
            errorBody = JSON.stringify(err, null, 4);
        } catch (e) {
            errorBody = "Error can't be stringified by JSON.stringify";
        }
    }

    var compiledTemplate = Mustache.render(errorDialogTemplate, {
        title: title,
        body: errorBody,
        showDetailsButton: showDetailsButton,
        Strings: Strings
    });

    dialog = Dialogs.showModalDialogUsingTemplate(compiledTemplate);

    dialog.done(function (buttonId) {
        if (buttonId === "report") {
            var mdReport = getMdReport({
                title: title,
                errorBody: errorBody,
                errorStack: errorStack
            });
            _reportBug(ExtensionInfo.getSync().homepage + "/issues/new?title=" +
                       encodeURIComponent(title) +
                       "&body=" +
                       encodeURIComponent(mdReport));
        }
        if (buttonId === "details") {
            NativeApp.openURLInDefaultBrowser(err.detailsUrl);
        }
    });

    if (typeof err === "string") { err = new Error(err); }
    err.__shown = true;
    return err;
};

export function toError(arg) {
    // FUTURE: use this everywhere and have a custom error class for this extension
    if (arg instanceof Error) { return arg; }
    var err = new Error(arg);
    // TODO: new class for this?
    err.match = function () {
        return arg.match.apply(arg, arguments);
    };
    return err;
};
