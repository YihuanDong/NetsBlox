/**
 * The InvasiveSpecies Service provides access to real-world invasive species data.
 * For more information, check out https://www.nwf.org/Educational-Resources/Wildlife-Guide/Threats-to-Wildlife/Invasive-Species
 *
 * @service
 */
var Storage = require("../../../storage/storage"),
    Logger = require("../../../logger"),
    logger = new Logger("netsblox:rpc:invasive-species"),
    storage = new Storage(logger),
    collectionName = "dataset";

const InvasiveSpecies = {};

// It might be nice to reuse a single DB connection
/**
 * Get data about the given feature for the state.
 * @param {String} stateName State
 * @param {String} featureName Data to query
 */
InvasiveSpecies.getData = function(stateName, featureName) {
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
            throw new Error("collection '" + collectionName + "' does not exist!");
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
                console.log("feature '" + featureName + "' does not exist.");
                throw new Error("feature '" + featureName + "' does not exist.");
            }
        }
        else {
            console.log("state '" + stateName + "' does not exist.");
            throw new Error("state '" + stateName + "' does not exist.");
        }
    })
    .catch(err => {
        storage.disconnect();
        console.log(err.message);
        this.response.status(500).send(err.message);
        throw err;
    });
}

/**
 * Get a list of all state names with data about invasive species.
 */
InvasiveSpecies.getStateNames = function() {
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
            throw new Error("collection '" + collectionName + "' does not exist!");
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
        this.response.status(500).send(err.message);
        throw err;
    });
}

module.exports = InvasiveSpecies;
