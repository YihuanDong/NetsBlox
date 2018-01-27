var Storage = require("../../../storage/storage"),
    Logger = require("../../../logger"),
    logger = new Logger("netsblox:cli:invasive-species"),
    storage = new Storage(logger),
    collectionName = "dataset";

var InvasiveSpecies = function() {

}

InvasiveSpecies.prototype.getData = function(stateName, featureName) {
    stateName = stateName.trim();
    featureName = featureName.trim();
    return storage.connect()
    //check if dataset exists;
    .then(db => {
        return db.listCollections({name: collectionName}).toArray().then((arr) => {
            if (arr[0]) {
                return db;
            }
            else {
                return null;
            }
        });
    })
    .then((db) => {
        if (db) {
            return db.collection(collectionName).find({"State Name": stateName.toLowerCase()}).toArray();
        }
        else {
            throw new Error("Error: collection '" + collectionName + "' does not exist!");
        }
    })
    .then(arr => {
        storage.disconnect();
        var stateInfo = arr[0];
        if (stateInfo) {
            if (stateInfo.hasOwnProperty(featureName)) {
                return stateInfo[featureName];
            }
            else {
                console.log("Error: feature'" + featureName + "' does not exist.");
                return "Error: feature'" + featureName + "' does not exist.";
            }
        }
        else {
            console.log("Error: state '" + stateName + "' does not exist.");
            return "Error: state '" + stateName + "' does not exist.";
        }
    })
    .catch(err => {
        storage.disconnect();
        console.log(err.message);
        return err.message;
    });
}

InvasiveSpecies.prototype.getStateNames = function() {
    return storage.connect()
    //check if dataset exists;
    .then(db => {
        return db.listCollections({name: collectionName}).toArray().then((arr) => {
            if (arr[0]) {
                return db;
            }
            else {
                return null;
            }
        });
    })
    .then(db => {
        if (db) {
            return db.collection(collectionName).find({},{"State Name": true}).toArray();
        }
        else {
            throw new Error("Error: collection '" + collectionName + "' does not exist!");
        }
    })
    .then(arr => {
        var list = [];
        for (let i = 0; i < arr.length; i++) {
            list.push(arr[i]["State Name"]);
        }
        return list;
    })
    .catch(err => {
        storage.disconnect();
        console.log(err.message);
        return err.message;
    });
}

InvasiveSpecies.getPath = function() {
    return "/invasive-species";
}

module.exports = InvasiveSpecies;