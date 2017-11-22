var Storage = require("../../../storage/storage"),
    Logger = require("../../../logger"),
    logger = new Logger("netsblox:cli:invasive-species"),
    storage = new Storage(logger),
    InvasiveSpecies = {},
    collectionName = "dataset";

InvasiveSpecies.getData = function(stateName, featureName) {
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
            return db.collection(collectionName).find({"state name": stateName}).toArray();
        }
        else {
            throw new Error("Error: collection '" + collectionName + "' does not exist!");
        }
    })
    .then(arr => {
        storage.disconnect();
        console.log(arr);
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
        console.log(err.message);
        return err.message;
    });
};

module.exports = InvasiveSpecies;